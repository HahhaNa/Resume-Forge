"use client";

/* ------------------------------------------------------------------ *
 * The tailoring agent.
 *
 *   read     the posting  ->  a list of requirements       (one model call)
 *   recall   the library  ->  a shortlist                  (BM25)
 *   judge    fan out      ->  one model call per requirement, in parallel
 *   fit      the scores   ->  one page of bullets          (arithmetic)
 *   critique the page     ->  which requirements went unanswered
 *
 * Two things about `judge` are worth stating, because they are the
 * whole reason it looks like this.
 *
 * **It fans out.** One call scoring sixty lines against twelve
 * requirements has to hold twelve rubrics at once and emit sixty rows,
 * and it drops some — silently, because a missing row is
 * indistinguishable from a zero. Twelve calls each holding one
 * requirement are more accurate, and each returns only the handful of
 * lines that are actually evidence, so the output is short enough to be
 * reliable. `Send` is what turns one node into that fan-out; the merge
 * happens in the `verdicts` reducer, keyed by (line, requirement).
 *
 * **Every one of those calls sends the same corpus.** That looks like
 * paying twelve times for the same tokens, and it would be, except the
 * shared half is a byte-identical prefix: the rubric and the CV lines
 * go in the system message, the requirement goes in the human message,
 * and nothing else varies. Anthropic caches that prefix when it is
 * marked; OpenAI caches long prefixes on its own. So the fan-out costs
 * twelve short questions against one corpus, not twelve corpora — and
 * `usage` reports the cache reads so the claim is checkable rather than
 * asserted.
 *
 * Sending every judge the *whole* shortlist rather than the slice
 * retrieved for its own requirement is what makes that prefix identical
 * — and it is better anyway, since it lets a judge find evidence BM25
 * ranked low for its requirement and high for someone else's.
 *
 * `critique` is the reason this is an agent and not a pipeline: the
 * page that comes out is checked against the requirements that went in,
 * and anything unanswered is searched for again with the terms the
 * model itself proposed. Two extra rounds, then it stops and reports
 * the gap honestly rather than looping until something turns up.
 *
 * What is deliberately *not* the model's job: choosing what fits. See
 * `pack.ts`. And what is deliberately not this file's job: writing new
 * bullets. Every line on the page is one the user wrote — the agent
 * selects, it never drafts, because a résumé that says something you
 * did not do is a worse outcome than a résumé with a gap in it.
 * ------------------------------------------------------------------ */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { chatModel, ready, type LlmSettings, type ProviderKind } from "./llm";
import { pack, type PackItem, type PackResult } from "./pack";
import { STRONG, buildIndex, corpus, expand, retrieve, tokenize, type Candidate, type Doc } from "./retrieve";
import type { DB, Variant } from "./types";

/* ------------------------------------------------------------------ *
 * what the model is asked for, and what it is allowed to hand back
 * ------------------------------------------------------------------ */

export interface Requirement {
  text: string;
  /** a stated requirement, or something the posting merely prefers */
  kind: "must" | "nice";
  /** the words an ATS would look for — also the query when `recall` runs again */
  keywords: string[];
}

const REQ_SCHEMA = {
  title: "requirements",
  type: "object",
  additionalProperties: false,
  required: ["requirements"],
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "kind", "keywords"],
        properties: {
          text: { type: "string", description: "one capability, in six words or fewer" },
          kind: { type: "string", enum: ["must", "nice"] },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "concrete terms a résumé would use for this — tools, languages, methods",
          },
        },
      },
    },
  },
} as const;

/** One line of the CV, judged against one requirement of the posting. */
export interface Verdict {
  /** doc id — a bullet or a skill group */
  id: string;
  /** index into the requirement list */
  req: number;
  /** 0..1 */
  score: number;
}

/**
 * Only the lines that *are* evidence come back, rather than a row per id.
 *
 * A judge asked to return sixty rows drops some, and a dropped row reads as a
 * zero — the failure is invisible. Asked for the handful that answer its one
 * requirement, the output is short, complete, and an empty list is a real
 * answer rather than a malfunction.
 */
const EVIDENCE_SCHEMA = {
  title: "evidence",
  type: "object",
  additionalProperties: false,
  required: ["evidence"],
  properties: {
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score"],
        properties: {
          id: { type: "string", description: "the id of a CV line, exactly as given" },
          score: { type: "number", description: "1 = direct evidence, 0.5 = adjacent or transferable" },
        },
      },
    },
  },
} as const;

/* ------------------------------------------------------------------ *
 * token accounting
 * ------------------------------------------------------------------ */

export interface Usage {
  calls: number;
  input: number;
  output: number;
  /** input tokens served from the provider's prompt cache */
  cacheRead: number;
  /** input tokens written into it */
  cacheWrite: number;
}

export const NO_USAGE: Usage = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const addUsage = (a: Usage, b: Usage): Usage => ({
  calls: a.calls + b.calls,
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

interface RawUsage {
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    input_token_details?: { cache_read?: number; cache_creation?: number };
  };
}

/** LangChain normalises Anthropic's and OpenAI's very different shapes into this one. */
function usageOf(raw: unknown): Usage {
  const u = (raw as RawUsage | undefined)?.usage_metadata;
  if (!u) return { ...NO_USAGE, calls: 1 };
  return {
    calls: 1,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.input_token_details?.cache_read ?? 0,
    cacheWrite: u.input_token_details?.cache_creation ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * talking to the model
 * ------------------------------------------------------------------ */

type Block = { type: "text"; text: string; cache_control?: { type: "ephemeral" } };
type Msg = { role: "system" | "user"; content: string | Block[] };

/**
 * The system message, marked so the provider will keep it.
 *
 * Anthropic caches a prefix only where a `cache_control` breakpoint says to, so
 * the block form is required there. Everyone else gets a plain string: OpenAI
 * caches long prefixes with no marker at all, Ollama has its own KV cache and
 * wants neither, and sending an unknown field to either is a needless way to be
 * rejected. The *text* is identical in both branches, which is the part that
 * actually matters.
 */
function systemMsg(text: string, kind: ProviderKind): Msg {
  return kind === "anthropic"
    ? { role: "system", content: [{ type: "text", text, cache_control: { type: "ephemeral" } }] }
    : { role: "system", content: text };
}

/**
 * Structured output, with a hand-rolled fallback.
 *
 * `withStructuredOutput` uses tool calling where the provider has it, and a
 * good half of the open models someone would point Ollama at either lack it or
 * do it badly. Falling back to "ask for JSON and find it in the reply" is what
 * keeps the open-model path from being a second-class one — it is also why
 * every schema here is shallow enough for a small model to hit.
 *
 * `includeRaw` is what makes token accounting possible: the parsed value alone
 * carries no usage, and without usage the caching above would be a claim rather
 * than a measurement.
 */
async function structured<T>(
  model: BaseChatModel,
  schema: object,
  msgs: Msg[]
): Promise<{ value: T; usage: Usage }> {
  const input = msgs as unknown as BaseLanguageModelInput;
  try {
    const bound = model.withStructuredOutput(schema as Record<string, unknown>, { includeRaw: true });
    const out = (await bound.invoke(input)) as { raw: unknown; parsed: T };
    return { value: out.parsed, usage: usageOf(out.raw) };
  } catch (e) {
    /* an auth failure or a rate limit is not a schema problem, and retrying it
       as free-text only produces a second, less informative error */
    if (fatal(e)) throw e;
    const last = msgs[msgs.length - 1];
    const asked: Msg[] = [
      ...msgs.slice(0, -1),
      {
        role: last.role,
        content: `${textOf(last)}\n\nReply with JSON matching this schema and nothing else:\n${JSON.stringify(schema)}`,
      },
    ];
    const res = await model.invoke(asked as unknown as BaseLanguageModelInput);
    const body = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    return { value: extractJson<T>(body), usage: usageOf(res) };
  }
}

const textOf = (m: Msg) =>
  typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join("\n");

/** Errors that a differently-shaped prompt cannot fix. */
function fatal(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /\b(401|403|429|invalid[_ ]api[_ ]key|authentication|rate[_ ]limit|insufficient[_ ]quota|credit balance)\b/i.test(m);
}

/** Small models fence their JSON, apologise before it, or explain it afterwards. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[{[]/);
  if (start < 0) throw new Error("the model replied without any JSON in it");
  /* scan for the matching close rather than trusting the last brace, which a
     trailing sentence containing one would otherwise steal */
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') inStr = !inStr;
    else if (!inStr && c === open) depth++;
    else if (!inStr && c === close && --depth === 0) {
      return JSON.parse(body.slice(start, i + 1)) as T;
    }
  }
  throw new Error("the model's JSON was cut off");
}

/* ------------------------------------------------------------------ *
 * step 1 — read the posting
 * ------------------------------------------------------------------ */

const READ_PROMPT = (jd: string) =>
  `You are reading a job posting so that a candidate can decide which lines of their own CV to put in front of it.

List the distinct capabilities this role actually requires. Rules:
- At most 12. Merge duplicates. Skip anything that is not a capability: salary, location, visa status, benefits, company boilerplate, equal-opportunity text.
- "must" for what the posting states as a requirement; "nice" for what it prefers.
- Keywords are the concrete terms a CV would use — languages, tools, methods, domains. Not adjectives.

Posting:
---
${jd}
---`;

/**
 * Reading the posting without a model at all. The headings and bullet markers
 * of a job ad carry most of its structure, and lifting the lines that look like
 * requirements is enough to drive retrieval. Worth having for its own sake:
 * it is what lets someone see the feature work before they have pasted a key
 * anywhere, and it is the fallback when a model is configured but unreachable.
 */
export function requirementsFromText(jd: string): Requirement[] {
  /* A posting is usually one requirement per line, and sometimes — copied from
     a site that collapses whitespace, or pasted out of a PDF — one paragraph
     with the line breaks gone. Splitting an over-long piece at its sentence
     boundaries covers the second shape without disturbing the first, which
     matters because the failure mode otherwise is silent: every piece fails the
     length filter and the tab reports nothing at all. */
  const lines = jd
    .split(/\r?\n/)
    .flatMap((l) => (l.length > 240 ? l.split(/(?<=[.;:])\s+(?=[A-Z])/) : [l]))
    .map((l) => l.replace(/^\s*[-*•●▪·o]\s+/, "").trim())
    .filter((l) => l.length > 12 && l.length < 240);

  /* boilerplate that every posting carries and no CV answers */
  const noise = /\b(equal opportunity|regardless of race|salary range|benefits package|apply now|about us|we are committed)\b/i;
  /* stems, opened at the end only: "familiar" has to reach "familiarity" and
     "proficien" has to reach "Proficiency", so a closing \b would throw away
     the two most common ways a posting states a requirement */
  const stated =
    /\b(experienc|proficien|familiar|knowledg|skill|abilit|strong|expert|background|understand|degree|requir|prefer|responsib|you will|you'll)|\b(plus|bonus)\b/i;

  /* word count is what separates a requirement from the heading above it:
     "What you'll do" says `you'll` and "Senior ML Engineer" starts with a
     capital, so neither the verb list nor capitalisation can tell them apart */
  const words = (l: string) => l.split(/\s+/).length;
  const usable = lines.filter((l) => !noise.test(l) && words(l) >= 5);
  const claims = usable.filter((l) => stated.test(l));
  const source = (claims.length >= 3 ? claims : usable).slice(0, 12);

  return source.map((text) => ({
    text: text.slice(0, 120),
    kind: /\b(preferred|plus|bonus|nice to have|desirable)\b/i.test(text) ? "nice" : "must",
    keywords: [...new Set(tokenize(text))].slice(0, 10),
  }));
}

/* ------------------------------------------------------------------ *
 * step 3 — judge, one requirement at a time
 * ------------------------------------------------------------------ */

const clean = (s: string) => s.replace(/\s+/g, " ").slice(0, 400);

/**
 * The cached half: the rubric and the CV lines. Identical for every requirement
 * in a run, which is the only reason the fan-out is affordable.
 *
 * It is also the whole of what leaves the browser about *you* — built here, in
 * one function, so the settings panel can show it verbatim before anything is
 * sent. The posting's requirements travel separately, in `requirementPrompt`.
 * Neither carries your applications, your notes, who referred you, or your
 * contact details.
 */
export function corpusPrompt(docs: Doc[]): string {
  return `You are matching one requirement of a job posting against the lines of a candidate's CV.

Judge only what a line says. Do not reward length, seniority, or a famous employer. A line on the
same broad topic is not evidence; a line that demonstrates the requirement is.

  1.0   direct evidence — this line shows the candidate has done it
  ~0.5  adjacent or transferable work
  below 0.2  not evidence — leave it out entirely

Return only the lines that are evidence for the requirement you are given. An empty list is the
right answer when nothing here answers it, and is far more useful than a stretched match.

CV lines, one per row as "id<TAB>text":
${docs.map((d) => `${d.id}\t${clean(d.text)}`).join("\n")}`;
}

/** The varying half: one requirement, and nothing else. */
export function requirementPrompt(r: Requirement): string {
  return `Requirement (${r.kind === "must" ? "stated requirement" : "preferred"}): ${r.text}
Related terms: ${r.keywords.join(", ") || "—"}

Which of the CV lines above are evidence for this one requirement?`;
}

/* ------------------------------------------------------------------ *
 * scoring a line for the packer
 * ------------------------------------------------------------------ */

/**
 * The floor a line's score has to clear before it is counted as answering a
 * requirement it claims to answer.
 *
 * Deliberately the same number as `STRONG`, and defined in terms of it so the
 * two cannot drift apart. They were briefly different — 0.35 here against 0.2
 * there — and the result was a requirement being reported as a gap while the
 * evidence for it sat on the page, because the two paths put scores on
 * different scales and a single hardcoded floor silently favoured one of them.
 *
 * `verdicts` is the real judgement in both paths: the model states which
 * requirements a line answers, and retrieval decides the same thing with
 * `STRONG`. This floor only exists to catch a model that contradicts itself by
 * returning a line as evidence and then scoring it as noise.
 */
const COVER_MIN = STRONG;

/**
 * The most a line with no verdict at all may be worth.
 *
 * The model decides what is evidence; retrieval decides what fills whatever
 * space is left over. Capping filler below `COVER_MIN` keeps the two from ever
 * being confused: a line the model did not return can occupy the bottom of the
 * page, and can never be cited as answering anything.
 */
const FILLER_MAX = COVER_MIN * 0.75;

/**
 * One number per line for the packer, from that line's verdicts.
 *
 * Noisy-or, not max: a line answering two requirements is worth more than one
 * answering a single one — that is the entire economics of a one-page résumé —
 * but with diminishing returns, so three half-matches never outrank one direct
 * hit. It needs no tuning constant and stays inside [0, 1], which max with a
 * breadth bonus does not.
 */
export function valueOf(scores: number[]): number {
  return 1 - scores.reduce((p, s) => p * (1 - Math.max(0, Math.min(1, s))), 1);
}

/** Every line worth offering the packer, scored. */
function scoreLines(verdicts: Verdict[], cands: Candidate[]): Map<string, number> {
  const byDoc = new Map<string, number[]>();
  for (const v of verdicts) {
    const list = byDoc.get(v.id);
    if (list) list.push(v.score);
    else byDoc.set(v.id, [v.score]);
  }
  const out = new Map<string, number>();
  for (const [id, scores] of byDoc) out.set(id, valueOf(scores));
  for (const c of cands) {
    if (out.has(c.doc.id)) continue;
    const best = Math.max(0, ...Object.values(c.perReq));
    if (best > 0) out.set(c.doc.id, best * FILLER_MAX);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * the graph
 * ------------------------------------------------------------------ */

export type StepName = "read" | "recall" | "judge" | "fit" | "critique";

export interface Step {
  name: StepName;
  detail: string;
  round: number;
}

export interface TailorInput {
  db: DB;
  base: Variant;
  jd: string;
  settings: LlmSettings;
  /** tags the user says this role is about, folded into retrieval */
  tags?: string[];
  pinnedEntryIds?: string[];
  pages?: number;
  /** how many times `critique` may send it back to `recall` */
  maxRounds?: number;
  /**
   * How many judges may be in flight at once. Twelve requirements is twelve
   * simultaneous requests, which is a rate limit on a new API key and a stalled
   * laptop on Ollama; four keeps the fan-out fast without either.
   */
  concurrency?: number;
  onStep?: (s: Step) => void;
  /**
   * How the model is built. Defaults to the configured provider; a test passes
   * a stand-in, which is the only way to exercise the fan-out — its topology,
   * its merge, and the identical-prefix property the caching depends on — with
   * no key and no network.
   */
  makeModel?: () => Promise<BaseChatModel>;
  /**
   * Skip `read` and use these instead.
   *
   * The eval harness needs this: measuring retrieval against a hand-labelled
   * answer key only means anything if the requirements are the ones that were
   * labelled. Left to extract them itself, a change to `requirementsFromText`
   * would move every score in the report and it would be impossible to tell
   * which stage had actually changed.
   */
  requirements?: Requirement[];
}

export interface Judged {
  doc: Doc;
  id: string;
  score: number;
  /** requirements this line is evidence for */
  reqs: number[];
}

export interface TailorResult {
  requirements: Requirement[];
  /** every line the run scored, with what it thought */
  judged: Judged[];
  result: PackResult;
  /** requirements with nothing on the page answering them */
  gaps: Requirement[];
  /** requirement -> the doc ids on the page that answer it */
  coverage: Map<number, string[]>;
  steps: Step[];
  usage: Usage;
  /** true when no model was reachable and retrieval alone did the work */
  offline: boolean;
}

interface JudgeTask {
  req: number;
  requirement: Requirement;
  docs: Doc[];
}

export async function tailor(input: TailorInput): Promise<TailorResult> {
  const { StateGraph, Annotation, Send, START, END } = await import("@langchain/langgraph/web");

  const State = Annotation.Root({
    requirements: Annotation<Requirement[]>({ reducer: (_, b) => b, default: () => [] }),
    queries: Annotation<string[]>({ reducer: (_, b) => b, default: () => [] }),
    candidates: Annotation<Candidate[]>({ reducer: (_, b) => b, default: () => [] }),
    /* the fan-out's merge point: parallel judges each write the verdicts for
       their own requirement, keyed so a later round can revise one without
       disturbing the rest */
    verdicts: Annotation<Verdict[]>({
      reducer: (a, b) => {
        if (!b.length) return a;
        const by = new Map(a.map((v) => [`${v.id}:${v.req}`, v]));
        for (const v of b) by.set(`${v.id}:${v.req}`, v);
        return [...by.values()];
      },
      default: () => [],
    }),
    result: Annotation<PackResult | null>({ reducer: (_, b) => b, default: () => null }),
    gaps: Annotation<number[]>({ reducer: (_, b) => b, default: () => [] }),
    round: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
    offline: Annotation<boolean>({ reducer: (a, b) => a || b, default: () => false }),
    usage: Annotation<Usage>({ reducer: addUsage, default: () => NO_USAGE }),
    steps: Annotation<Step[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  });

  const docs = corpus(input.db);
  const index = buildIndex(docs);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const maxRounds = input.maxRounds ?? 2;
  const kind = input.settings.kind;

  let model: BaseChatModel | null = null;
  const build = input.makeModel ?? (() => chatModel(input.settings));
  const getModel = async () => (model ??= await build());
  /* "no model configured" is a state to check, not an exception to catch: going
     through the model and reading the failure would mean deciding what an
     unconfigured provider's error text looks like, which is neither knowable
     nor stable. An injected model is by definition one you have. */
  const usable = input.makeModel ? true : ready(input.settings);

  const say = (name: StepName, detail: string, round: number): Step[] => {
    const s: Step = { name, detail, round };
    input.onStep?.(s);
    return [s];
  };

  /* --- read ------------------------------------------------------- */
  const readWithout = (why: string) => {
    const reqs = requirementsFromText(input.jd);
    return {
      requirements: reqs,
      queries: reqs.map((r) => [r.text, ...r.keywords].join(" ")),
      offline: true,
      steps: say("read", `${reqs.length} requirements, ${why}`, 0),
    };
  };

  const read = async () => {
    if (input.requirements?.length) {
      const reqs = input.requirements;
      return {
        requirements: reqs,
        queries: reqs.map((r) => [r.text, ...r.keywords].join(" ")),
        offline: !usable,
        steps: say("read", `${reqs.length} requirements, given`, 0),
      };
    }
    if (!usable) return readWithout("no model connected");
    try {
      const { value, usage } = await structured<{ requirements: Requirement[] }>(
        await getModel(),
        REQ_SCHEMA,
        [{ role: "user", content: READ_PROMPT(input.jd) }]
      );
      const reqs = (value.requirements ?? [])
        .filter((r) => r && typeof r.text === "string" && r.text.trim())
        .slice(0, 12)
        .map((r) => ({
          text: r.text.trim(),
          kind: r.kind === "nice" ? ("nice" as const) : ("must" as const),
          keywords: Array.isArray(r.keywords) ? r.keywords.map(String).filter(Boolean) : [],
        }));
      if (!reqs.length) throw new Error("no requirements came back");
      return {
        requirements: reqs,
        queries: reqs.map((r) => [r.text, ...r.keywords].join(" ")),
        usage,
        steps: say("read", `${reqs.length} requirements`, 0),
      };
    } catch (e) {
      /* same rule as the judges: a rejected key is not something to work around
         quietly, because the user cannot fix what they are not told about */
      if (fatal(e)) throw e;
      /* a posting still has to be readable when the model merely misbehaves */
      return readWithout(`read without a model (${msg(e)})`);
    }
  };

  /* --- recall ----------------------------------------------------- */
  const recall = async (s: typeof State.State) => {
    /* a later round searches harder, because the first one already missed */
    const perReq = 8 + s.round * 6;
    const cands = retrieve(index, s.queries, { tags: input.tags, perReq, limit: 40 + s.round * 30 });
    return {
      candidates: cands,
      steps: say("recall", `${cands.length} lines shortlisted from ${docs.length}`, s.round),
    };
  };

  /* --- judge: one task per requirement, run in parallel ------------ */
  const judgeOne = async (task: JudgeTask) => {
    try {
      const { value, usage } = await structured<{ evidence: { id: string; score: number }[] }>(
        await getModel(),
        EVIDENCE_SCHEMA,
        [
          systemMsg(corpusPrompt(task.docs), kind),
          { role: "user", content: requirementPrompt(task.requirement) },
        ]
      );
      const seen = new Set(task.docs.map((d) => d.id));
      const verdicts: Verdict[] = (value.evidence ?? [])
        /* a small model will occasionally answer with an id it invented */
        .filter((x) => x && seen.has(String(x.id)))
        .map((x) => ({ id: String(x.id), req: task.req, score: clamp(Number(x.score)) }))
        .filter((v) => v.score > 0);
      return {
        verdicts,
        usage,
        steps: say("judge", `#${task.req} — ${verdicts.length} of ${task.docs.length} are evidence`, 0),
      };
    } catch (e) {
      /* A bad key or an exhausted quota is not one judge having a bad day — it
         is every judge, and quietly handing back a keyword-matched résumé while
         the panel still says a model is connected would be a lie. Let it out. */
      if (fatal(e)) throw e;
      /* anything else — a malformed reply, a timeout — costs this requirement
         and not the other eleven: it falls back to what retrieval knows */
      return {
        verdicts: retrievalVerdicts(task.docs, task.req, index, task.requirement),
        steps: say("judge", `#${task.req} — retrieval only (${msg(e)})`, 0),
      };
    }
  };

  /* --- judge, with no model at all -------------------------------- */
  const score = async (s: typeof State.State) => {
    const verdicts: Verdict[] = [];
    for (const c of s.candidates) {
      for (const i of c.forReqs) {
        const cover = c.perReq[i] ?? 0;
        if (cover >= STRONG) verdicts.push({ id: c.doc.id, req: i, score: clamp(cover) });
      }
    }
    return {
      verdicts,
      steps: say("judge", `${s.candidates.length} lines scored by retrieval alone`, s.round),
    };
  };

  /* --- fit -------------------------------------------------------- */
  const fit = async (s: typeof State.State) => {
    const scores = scoreLines(s.verdicts, s.candidates);
    const items: PackItem[] = [...scores].flatMap(([id, value]) => {
      const doc = byId.get(id);
      return doc ? [{ id, kind: doc.kind, entryId: doc.entryId, score: value }] : [];
    });
    const result = pack(input.db, input.base, items, {
      pages: input.pages,
      pinnedEntryIds: input.pinnedEntryIds,
    });
    return {
      result,
      steps: say("fit", `${result.chosen.length} lines, ${(result.fill * 100).toFixed(0)}% of the page`, s.round),
    };
  };

  /* --- critique --------------------------------------------------- */
  const critique = async (s: typeof State.State) => {
    const on = new Set(s.result?.chosen ?? []);
    const gaps: number[] = [];
    s.requirements.forEach((_, i) => {
      const answered = s.verdicts.some((v) => v.req === i && v.score >= COVER_MIN && on.has(v.id));
      if (!answered) gaps.push(i);
    });
    const musts = gaps.filter((i) => s.requirements[i].kind === "must");
    return {
      gaps,
      round: s.round + 1,
      steps: say(
        "critique",
        gaps.length
          ? `${musts.length} required and ${gaps.length - musts.length} preferred unanswered`
          : "every requirement answered",
        s.round
      ),
    };
  };

  /**
   * Going round again is only worth it when there is somewhere new to look.
   * A gap whose keywords are already in the query has been searched for and
   * genuinely is not in the library, and re-running BM25 on the same terms
   * would return the same rows and burn another fan-out to say so.
   */
  const again = (s: typeof State.State): boolean => {
    if (s.round > maxRounds) return false;
    const unmet = s.gaps.filter((i) => s.requirements[i]?.kind === "must");
    if (!unmet.length) return false;
    const asked = new Set(s.queries.flatMap((q) => expand(q)));
    return unmet.some((i) => expand(s.requirements[i].keywords.join(" ")).some((t) => !asked.has(t)));
  };

  /* the widened query is the model's own keywords for what it could not find */
  const widen = async (s: typeof State.State) => ({
    queries: [
      ...s.queries,
      ...s.gaps.map((i) => s.requirements[i]?.keywords.join(" ") ?? "").filter(Boolean),
    ],
  });

  /**
   * The fan-out. One `Send` per requirement, each carrying the whole shortlist
   * so that every judge shares a byte-identical prompt prefix — see the file
   * header. With no model, or nothing to judge, this collapses to the single
   * retrieval-only node instead.
   */
  const fanOut = (s: typeof State.State) => {
    if (s.offline || !s.requirements.length || !s.candidates.length) return "score";
    const docs = s.candidates.map((c) => c.doc);
    return s.requirements.map(
      (requirement, req) => new Send("judgeOne", { req, requirement, docs } satisfies JudgeTask)
    );
  };

  const graph = new StateGraph(State)
    .addNode("read", read)
    .addNode("recall", recall)
    .addNode("judgeOne", judgeOne)
    .addNode("score", score)
    .addNode("fit", fit)
    .addNode("critique", critique)
    .addNode("widen", widen)
    .addEdge(START, "read")
    .addEdge("read", "recall")
    .addEdge("widen", "recall")
    .addConditionalEdges("recall", fanOut, ["judgeOne", "score"])
    /* both arrive at `fit`, and the fan-out's branches join here: every judge
       of a superstep finishes before this edge fires once */
    .addEdge("judgeOne", "fit")
    .addEdge("score", "fit")
    .addEdge("fit", "critique")
    .addConditionalEdges("critique", (s) => (again(s) ? "widen" : END), ["widen", END])
    .compile();

  const out = await graph.invoke({}, { maxConcurrency: input.concurrency ?? 4 });

  const scores = scoreLines(out.verdicts, out.candidates);
  const judged: Judged[] = [...scores].flatMap(([id, score]) => {
    const doc = byId.get(id);
    if (!doc) return [];
    const reqs = out.verdicts.filter((v) => v.id === id && v.score >= COVER_MIN).map((v) => v.req);
    return [{ doc, id, score, reqs: [...new Set(reqs)].sort((a, b) => a - b) }];
  });

  const on = new Set(out.result?.chosen ?? []);
  const coverage = new Map<number, string[]>();
  out.requirements.forEach((_, i) => {
    coverage.set(
      i,
      out.verdicts.filter((v) => v.req === i && v.score >= COVER_MIN && on.has(v.id)).map((v) => v.id)
    );
  });

  return {
    requirements: out.requirements,
    judged,
    result: out.result ?? pack(input.db, input.base, [], { pages: input.pages }),
    gaps: out.gaps.map((i) => out.requirements[i]).filter(Boolean),
    coverage,
    steps: out.steps,
    usage: out.usage,
    offline: out.offline,
  };
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What one failed judge falls back to: retrieval's own view of its requirement. */
function retrievalVerdicts(
  docs: Doc[],
  req: number,
  index: ReturnType<typeof buildIndex>,
  requirement: Requirement
): Verdict[] {
  const query = [requirement.text, ...requirement.keywords].join(" ");
  const want = new Set(docs.map((d) => d.id));
  return retrieve(index, [query], { perReq: docs.length })
    .filter((c) => want.has(c.doc.id) && (c.perReq[0] ?? 0) >= STRONG)
    .map((c) => ({ id: c.doc.id, req, score: clamp(c.perReq[0] ?? 0) }));
}

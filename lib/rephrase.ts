/* ------------------------------------------------------------------ *
 * Rewording a line you already wrote, without letting anything new in.
 *
 * Every other part of this app selects. This is the one place that
 * writes, and that is worth being nervous about. The promise the rest
 * of the product makes — every line on the page is one you wrote, and
 * you can defend all of it in a room — does not survive a model quietly
 * upgrading "improved throughput" into "improved throughput by 40%".
 * The line that gets you the interview is the line that ends it.
 *
 * So the model may change *wording* and nothing else, and "nothing
 * else" is enforced here rather than asked for in a prompt. `facts()`
 * pulls out the tokens that carry a checkable claim — numbers, units,
 * tool names, proper nouns — and `check()` refuses any rewrite whose
 * fact set is not a subset of the original's. A prompt can be talked
 * out of a rule. A subset test cannot.
 *
 * Dropping a fact is allowed, and reported: shortening a line so it
 * fits is the whole point of the tab this runs in. Inventing one is
 * not, and there is no "accept anyway" — the hand editor already
 * exists, and a claim you typed yourself is a claim you have read.
 * ------------------------------------------------------------------ */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type Msg, type Requirement, type Usage, NO_USAGE, bound, structured } from "./agent";
import { ALIASES, expand } from "./retrieve";
import { fence, nonce } from "./untrusted";

/* ------------------------------------------------------------------ *
 * what counts as a fact
 * ------------------------------------------------------------------ */

/**
 * Bold markers are presentation, and `**40%**` and `40%` are the same claim.
 * Trailing sentence punctuation is not part of a token either.
 */
const bare = (s: string) => s.replace(/\*\*/g, "");

const trim = (t: string) => t.replace(/^[^\w%+#]+|[^\w%+#]+$/g, "");

/**
 * Ordinary words that are nevertheless claims.
 *
 * The five shape rules below catch anything that *looks* like a fact — a digit,
 * a capital, a dotted name. They are blind to the claims English writes in
 * plain lowercase, which are the ones that actually get caught in a room:
 * "contributed to" becoming "led", "improved" becoming "doubled", "worked on"
 * becoming "owned". Those are the résumé lies with consequences, and they are
 * invisible to a rule about capital letters.
 *
 * The list is deliberately short and covers three things only — magnitude,
 * primacy, and seniority. Ordinary verbs a rewrite must be free to use
 * (`designed`, `built`, `wrote`, `shipped`) are not here, because a guard that
 * refuses every rewrite is one nobody leaves switched on.
 */
export const CLAIMS = new Set([
  /* magnitude */
  "doubled", "tripled", "quadrupled", "halved", "eliminated", "eradicated",
  /* primacy */
  "first", "sole", "solely", "only", "single-handedly", "singlehandedly",
  "pioneered", "invented", "founded", "originated",
  /* seniority and ownership */
  "led", "lead", "leading", "managed", "headed", "owned", "ownership",
  "mentored", "supervised", "directed", "architected", "oversaw", "spearheaded",
]);

/**
 * Tokens carrying something an interviewer could check.
 *
 * Five rules, all deliberately over-eager. A false positive here only makes the
 * guard stricter — it rejects a rewrite that was in fact honest, and the cost of
 * that is one unhelpful suggestion. A false negative lets an invented number
 * onto a résumé. The asymmetry is the whole design, so when in doubt a token is
 * a fact.
 *
 *   1. anything with a digit          40%, 1.9x, 7B, p99, 256
 *   2. an all-caps run                CUDA, GPU, RTL, ITRI
 *   3. an internal capital            PyTorch, LangGraph, NumPy
 *   4. capitalised mid-sentence       Verilog, Python, Micron
 *   5. internal punctuation           node.js, c++, f1-score
 *
 * Rule 4 skips the first word, which is nearly always an ordinary verb
 * ("Designed…", "Reduced…") and would otherwise be a fact in every line.
 */
export function facts(text: string): string[] {
  const words = bare(text).split(/\s+/).filter(Boolean);
  const out = new Set<string>();

  words.forEach((raw, i) => {
    const w = trim(raw);
    if (w.length < 2) return;

    const digit = /\d/.test(w);
    const allCaps = /^[A-Z]{2,}$/.test(w.replace(/[^A-Za-z]/g, ""));
    const innerCap = /^[A-Za-z][a-z]*[A-Z]/.test(w);
    const midCap = i > 0 && /^[A-Z][a-z]+$/.test(w);
    const punct = /[a-zA-Z0-9][.+#_-][a-zA-Z0-9+#]/.test(w);
    const claim = CLAIMS.has(w.toLowerCase());

    if (digit || allCaps || innerCap || midCap || punct || claim) out.add(w.toLowerCase());
  });

  return [...out].sort();
}

/* ------------------------------------------------------------------ *
 * the guard
 * ------------------------------------------------------------------ */

export interface Check {
  /** whether this rewrite may be offered at all */
  ok: boolean;
  /** facts the rewrite has that nothing licenses — the disqualifier */
  invented: string[];
  /** facts the original had and the rewrite dropped — allowed, worth showing */
  dropped: string[];
  /** facts not in the line, but true of the entry it belongs to */
  borrowed: string[];
  /** characters added; negative is shorter. The page counter is the real judge */
  delta: number;
  reason: "" | "invented" | "unchanged" | "empty";
}

/**
 * Everything the line's own entry already says about it.
 *
 * A bullet is not written in isolation and should not be checked as though it
 * were. "Cut inference latency" sitting under *ML Systems Intern, CAST Lab*
 * with the tag `llm` is a line about LLM inference whether or not it uses the
 * letters — `retrieve.ts` makes the same argument when it treats an entry's org
 * as evidence for a bullet that omits it, and the tag vocabulary is the user's
 * own hand-built supervision, not a guess.
 *
 * The one thing that is never a source here is the **posting**. It is the whole
 * attack surface: an advert that says TensorRT must not thereby license writing
 * TensorRT onto a résumé. Only your own library can vouch for a term.
 */
export function contextOf(parts: (string | string[] | undefined)[]): string[] {
  return parts.flatMap((p) => (Array.isArray(p) ? p : p ? [p] : []));
}

/**
 * Does this rewrite say anything nothing licenses?
 *
 * Two tiers, because the two kinds of fact carry different risk.
 *
 * A fact **with a digit in it** — 40%, 7B, p99, 12ms — must appear in the
 * original line and nowhere else will do. Numbers are the claims that get
 * checked in a room, they are the ones a helpful model inflates, and no amount
 * of surrounding context makes up a number that was never measured.
 *
 * A fact **without** one — CUDA, PyTorch, Verilog, LLM — may also come from the
 * entry's own context, expanded through the same alias table retrieval uses, so
 * `llm` on the entry licenses "LLM" in the line and `language model` licenses it
 * too. This is the tier that makes the feature usable at all: the posting's
 * vocabulary is by definition not in your sentence yet, and matching it is the
 * entire request.
 */
export function check(original: string, rewritten: string, context: string[] = []): Check {
  const mine = new Set(facts(original));
  const licensed = new Set(expand(context.join(" ")));

  /**
   * An acronym is vouched for by its own spelled-out form, and only when the
   * whole of it is there.
   *
   * The alias table is built for retrieval, where casting wide is cheap and a
   * spurious match costs one row of shortlist. Licensing is the opposite trade:
   * a spurious match writes a claim onto a résumé. So it is read in one
   * direction and all-or-nothing — "large language model" vouches for LLM,
   * while "deep learning" does not vouch for PyTorch, even though the table
   * connects them, because `torch` is missing and that is the part that would
   * have been the lie.
   */
  const spelledOut = (f: string) => {
    const parts = ALIASES[f];
    return !!parts?.length && parts.every((t) => licensed.has(t));
  };

  /* a claim of magnitude, primacy or seniority is as dangerous as a number and
     is licensed the same way: from the original line, or not at all. A tag
     saying `ml` cannot make you the person who led the team */
  const originalOnly = (f: string) => /\d/.test(f) || CLAIMS.has(f);

  const has = (f: string) =>
    mine.has(f) || (!originalOnly(f) && (licensed.has(f) || spelledOut(f)));

  const after = facts(rewritten);
  const invented = after.filter((f) => !has(f));
  const borrowed = after.filter((f) => !mine.has(f) && !invented.includes(f));
  const dropped = [...mine].filter((f) => !after.includes(f)).sort();
  const delta = bare(rewritten).length - bare(original).length;

  const empty = !rewritten.trim();
  const same = bare(rewritten).trim().toLowerCase() === bare(original).trim().toLowerCase();

  const reason: Check["reason"] = empty
    ? "empty"
    : invented.length
      ? "invented"
      : same
        ? "unchanged"
        : "";

  return { ok: reason === "", invented, dropped, borrowed, delta, reason };
}

/* ------------------------------------------------------------------ *
 * asking for one
 * ------------------------------------------------------------------ */

export interface Proposal {
  bulletId: string;
  original: string;
  rewritten: string;
  /** indices into the run's requirement list that this rewrite was aimed at */
  reqs: number[];
  check: Check;
}

export interface RephraseInput {
  bulletId: string;
  text: string;
  /** what the posting asked for, already `bound` by the time it reaches here */
  requirements: Requirement[];
  reqs: number[];
  /** the entry's own words — org, title, tags. Never the posting. */
  context?: string[];
  model: BaseChatModel;
  kind: "anthropic" | "openai" | "ollama" | "compatible";
}

const SCHEMA = {
  type: "object",
  properties: { rewritten: { type: "string" } },
  required: ["rewritten"],
  additionalProperties: false,
} as const;

/**
 * The rule, stated to the model as well as enforced after it.
 *
 * Saying it twice is not redundancy. The guard decides what ships; the prompt
 * decides how often the guard has to reject something, and a model told the
 * actual rule produces usable rewrites far more often than one left to guess
 * and then refused.
 */
export const RULE = `You reword one line of a résumé so it speaks to what a job posting asked for.

Absolute rules:
- Use ONLY facts already present in the line. Invent nothing.
- Never add a number, percentage, duration, scale, tool, language, framework, company or product name that is not already in the line.
- You may drop detail, reorder, change voice or tense, and swap ordinary words for the posting's vocabulary.
- Keep it one line, and no longer than the original unless there is a clear reason.
- If the line genuinely cannot be brought closer to the requirement without inventing something, return it unchanged.

Return JSON: {"rewritten": "..."}`;

/**
 * One rewrite, checked before it is returned.
 *
 * The requirement is fenced with a per-call nonce for the same reason the judges
 * fence theirs: it is text from a job board, and this is the one prompt in the
 * app whose output is prose rather than a score. An injection that lands here
 * writes on the résumé, so it is fenced, and then the result is checked anyway.
 */
export async function propose(input: RephraseInput): Promise<{ proposal: Proposal; usage: Usage }> {
  const id = nonce();
  const asks = input.reqs
    .map((i) => input.requirements[i])
    .filter(Boolean)
    .map(bound)
    .map((r) => `- ${r.text}`)
    .join("\n");

  const msgs: Msg[] = [
    input.kind === "anthropic"
      ? { role: "system", content: [{ type: "text", text: RULE, cache_control: { type: "ephemeral" } }] }
      : { role: "system", content: RULE },
    {
      role: "user",
      content: `${fence(asks, id, "POSTING")}\n\nThe line to reword:\n${input.text}`,
    },
  ];

  try {
    const { value, usage } = await structured<{ rewritten: string }>(input.model, SCHEMA, msgs);
    const rewritten = (value?.rewritten ?? "").trim();
    return {
      proposal: {
        bulletId: input.bulletId,
        original: input.text,
        rewritten,
        reqs: input.reqs,
        check: check(input.text, rewritten, input.context),
      },
      usage,
    };
  } catch {
    /* a failed rewrite is a suggestion that does not appear, not a broken run —
       the page this sits beside is already complete without it */
    return {
      proposal: {
        bulletId: input.bulletId,
        original: input.text,
        rewritten: "",
        reqs: input.reqs,
        check: check(input.text, "", input.context),
      },
      usage: NO_USAGE,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Running the answer key against the real agent.
 *
 * Two modes, and the split is the point.
 *
 * **Retrieval mode** needs no key and no network, so it runs on every
 * commit alongside the unit tests. That is what makes the constants in
 * `retrieve.ts` — `STRONG`, the BM25 parameters, the alias table —
 * safe to touch: they are the kind of number that is tuned by feel and
 * then never revisited, and until there was a report to move, nobody
 * could tell an improvement from a regression.
 *
 * **Model mode** runs the same key through whichever provider the
 * environment names. It is not free and it is not deterministic, so it
 * is opt-in — but the difference between the two reports is the only
 * honest answer to "what does connecting a model actually buy?", and
 * that answer belongs in a measurement rather than in a README.
 * ------------------------------------------------------------------ */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { NO_USAGE, shortlistFor, tailor, type Usage } from "../agent";
import { BLANK, providerOf, type LlmSettings, type ProviderKind } from "../llm";
import { buildIndex, corpus } from "../retrieve";
import { CASES, type Case } from "./cases";
import { EVAL_DB, EVAL_VARIANT } from "./corpus";
import {
  NO_METRICS,
  mergeMetrics,
  pct,
  scoreCase,
  type CaseScore,
  type Metrics,
} from "./score";

export interface CaseReport extends CaseScore {
  name: string;
  probes: string;
}

export interface Report {
  mode: "retrieval" | "model";
  model: string;
  cases: CaseReport[];
  total: Metrics;
  usage: Usage;
}

export interface RunOptions {
  cases?: Case[];
  settings?: LlmSettings;
  makeModel?: () => Promise<BaseChatModel>;
  concurrency?: number;
}

async function runCase(c: Case, opts: RunOptions): Promise<CaseReport> {
  const out = await tailor({
    db: EVAL_DB,
    base: EVAL_VARIANT,
    /* the requirements are injected, so the posting text is never read — see
       `TailorInput.requirements` for why the eval pins them */
    jd: "",
    requirements: c.requirements,
    settings: opts.settings ?? BLANK,
    makeModel: opts.makeModel,
    concurrency: opts.concurrency,
    pinnedEntryIds: EVAL_DB.entries.filter((e) => e.kind === "education").map((e) => e.id),
  });

  const considered = new Set(out.considered);
  const gapIndex = new Set(out.gaps.map((g) => out.requirements.indexOf(g)));
  const creditedFor = (req: number) =>
    new Set(out.judged.filter((j) => j.reqs.includes(req)).map((j) => j.id));

  const score = scoreCase(
    c.requirements.map((r, req) => ({
      labels: { answers: r.answers, traps: r.traps ?? [], gap: r.answers.length === 0 },
      observed: {
        shortlisted: considered,
        credited: creditedFor(req),
        reportedGap: gapIndex.has(req),
      },
    }))
  );

  return { ...score, name: c.name, probes: c.probes, metrics: score.metrics };
}

export async function runEval(opts: RunOptions = {}): Promise<Report> {
  const cases = opts.cases ?? CASES;
  const reports: CaseReport[] = [];
  /* sequentially: the cases share a provider, and a model-mode run that fans
     out five postings at once is a rate limit rather than a measurement */
  for (const c of cases) reports.push(await runCase(c, opts));

  return {
    mode: opts.makeModel || opts.settings ? "model" : "retrieval",
    model: opts.settings?.model ?? "—",
    cases: reports,
    total: reports.reduce((m, r) => mergeMetrics(m, r.metrics), NO_METRICS()),
    usage: NO_USAGE,
  };
}

/* ------------------------------------------------------------------ *
 * a sanity check on the corpus itself
 * ------------------------------------------------------------------ */

/**
 * Every id the answer key names has to exist in the fixture.
 *
 * An answer key that points at a line which was renamed scores it as a permanent
 * miss, and a trap that points at nothing is a test that can never fail. Both
 * look like a slightly worse model rather than a broken key, which is why this
 * is checked rather than assumed.
 */
export function danglingIds(cases: Case[] = CASES): string[] {
  const known = new Set(corpus(EVAL_DB).map((d) => d.id));
  const bad: string[] = [];
  for (const c of cases) {
    c.requirements.forEach((r, i) => {
      for (const id of [...r.answers, ...(r.traps ?? [])]) {
        if (!known.has(id)) bad.push(`${c.name} requirement ${i}: ${id}`);
      }
    });
  }
  return bad;
}

/** What the retriever can see at all, before any judging — the ceiling, per case. */
export function ceiling(c: Case): { hit: number; of: number } {
  const index = buildIndex(corpus(EVAL_DB));
  const queries = c.requirements.map((r) => [r.text, ...r.keywords].join(" "));
  const seen = new Set(shortlistFor(index, queries).map((x) => x.doc.id));
  let hit = 0;
  let of = 0;
  for (const r of c.requirements) {
    for (const id of r.answers) {
      of += 1;
      if (seen.has(id)) hit += 1;
    }
  }
  return { hit, of };
}

/* ------------------------------------------------------------------ *
 * the printed report
 * ------------------------------------------------------------------ */

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

export function formatReport(r: Report): string {
  const lines: string[] = [];
  const head = `${pad("case", 18)}${["shortlist", "recall", "precis.", "traps", "gaps"].map((h) => h.padStart(10)).join("")}`;
  lines.push(`mode: ${r.mode}${r.mode === "model" ? ` (${r.model})` : ""}`);
  lines.push("");
  lines.push(head);
  lines.push("─".repeat(head.length));
  for (const c of r.cases) {
    lines.push(
      pad(c.name, 18) +
        [c.metrics.shortlist, c.metrics.recall, c.metrics.precision, c.metrics.traps, c.metrics.gaps]
          .map((m) => pct(m).padStart(10))
          .join("")
    );
  }
  lines.push("─".repeat(head.length));
  lines.push(
    pad("total", 18) +
      [r.total.shortlist, r.total.recall, r.total.precision, r.total.traps, r.total.gaps]
        .map((m) => pct(m).padStart(10))
        .join("")
  );
  lines.push("");
  lines.push("traps: lower is better. everything else: higher is better.");

  for (const c of r.cases) {
    const notes: string[] = [];
    if (c.neverFound.length) notes.push(`  never retrieved  ${c.neverFound.join(", ")}`);
    if (c.notCredited.length) notes.push(`  retrieved, not credited  ${c.notCredited.join(", ")}`);
    if (c.sprung.length) notes.push(`  trap sprung  ${c.sprung.join(", ")}`);
    if (c.overClaimed.length) notes.push(`  credited, not evidence  ${c.overClaimed.join(", ")}`);
    if (notes.length) {
      lines.push("");
      lines.push(`${c.name}`);
      lines.push(...notes);
    }
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * model mode, from the environment
 * ------------------------------------------------------------------ */

/**
 * Settings for a model-backed run, or null when the environment does not name
 * one. The browser keeps its key in localStorage, which a node process cannot
 * reach and should not — so model mode is configured separately and on purpose.
 */
export function settingsFromEnv(env: Record<string, string | undefined>): LlmSettings | null {
  const kind = (env.EVAL_PROVIDER ?? "anthropic") as ProviderKind;
  const model = env.EVAL_MODEL?.trim() ?? "";
  if (!model) return null;
  const apiKey =
    (kind === "anthropic" ? env.ANTHROPIC_API_KEY : kind === "openai" ? env.OPENAI_API_KEY : env.EVAL_API_KEY) ?? "";
  if (providerOf(kind).needsKey && !apiKey) return null;
  return { kind, model, apiKey, baseUrl: env.EVAL_BASE_URL ?? "", enabled: true };
}

/* ------------------------------------------------------------------ *
 * Retrieval over your own bullet library.
 *
 * The corpus a job description is matched against is small — a few
 * hundred lines, all written by one person, all about their own work.
 * That size is what decides the method. Embeddings would mean an extra
 * provider, an API key that buys nothing else, a vector store to keep
 * in step with edits, and a network round trip before the first result;
 * for a few hundred short documents, BM25 with a synonym pass is not a
 * degraded stand-in for that, it is the better answer — it is exact on
 * the terms that actually decide a match (`CUDA`, `Verilog`, `PyTorch`),
 * it runs offline, and it costs nothing.
 *
 * Where lexical retrieval genuinely loses is vocabulary mismatch: a JD
 * asking for "LLM inference optimisation" against a bullet that says
 * "cut decode latency on a 7B model". Two things close most of that
 * gap here — ALIASES, which folds the abbreviations this domain is full
 * of into one term, and the tag vocabulary the user already maintains,
 * which is hand-built supervision that no embedding model has. What is
 * left is what the model in `agent.ts` is for: it reads the shortlist
 * this file returns and judges meaning. Retrieval only has to get the
 * right lines *into* that shortlist, which is a much easier problem
 * than ranking them.
 * ------------------------------------------------------------------ */

import type { DB, Entry, EntryKind } from "./types";

/** One retrievable line: a bullet, or a skill group. */
export interface Doc {
  /** bullet id, or skill-group id */
  id: string;
  kind: "bullet" | "skill";
  /** the entry a bullet belongs to; empty for a skill group */
  entryId: string;
  entryKind: EntryKind | "";
  text: string;
  /** the entry's own context — an org name is evidence even when the bullet omits it */
  context: string;
  tags: string[];
}

/* ------------------------------------------------------------------ *
 * tokenising
 * ------------------------------------------------------------------ */

/**
 * `c++`, `node.js` and `f1-score` are single terms, and splitting them on
 * punctuation turns all three into noise — `c` matches everything and `js`
 * matches nothing. So punctuation only splits when it is not sitting between
 * two word characters, and a trailing `++`/`#` is kept.
 */
export function tokenize(s: string): string[] {
  return (
    s
      .toLowerCase()
      .replace(/\*{2,}/g, " ")
      .match(/[a-z0-9]+(?:[.+#_-][a-z0-9+#]+)*\+*#?/g) ?? []
  )
    .map((t) => t.replace(/^[-_.]+|[-_.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  "the", "and", "for", "with", "you", "your", "our", "are", "was", "were", "will", "have", "has",
  "had", "this", "that", "these", "those", "from", "into", "over", "under", "such", "than", "then",
  "they", "their", "them", "not", "but", "all", "any", "can", "may", "must", "should", "would",
  "who", "what", "when", "which", "while", "work", "working", "role", "team", "teams", "job",
  "position", "candidate", "candidates", "experience", "years", "year", "strong", "excellent",
  "ability", "including", "etc", "using", "use", "used", "well", "new", "also", "more", "most",
  "other", "across", "within", "about",
]);

/**
 * Terms that name the same thing. Written one-way — key expands to the values,
 * and the expansion is applied to both the query and the documents, so it does
 * not matter which side used which spelling.
 *
 * This is the file's one piece of hand-maintained domain knowledge, and it is
 * also the cheapest contribution anyone can make to matching quality: a missing
 * row here is a silently missed bullet.
 */
export const ALIASES: Record<string, string[]> = {
  ml: ["machine", "learning"],
  ai: ["artificial", "intelligence"],
  dl: ["deep", "learning"],
  nlp: ["natural", "language"],
  llm: ["large", "language", "model"],
  llms: ["llm", "large", "language", "model"],
  cv: ["computer", "vision"],
  rl: ["reinforcement", "learning"],
  js: ["javascript"],
  ts: ["typescript"],
  py: ["python"],
  k8s: ["kubernetes"],
  ci: ["continuous", "integration"],
  cd: ["continuous", "delivery"],
  gpu: ["cuda", "accelerator"],
  hpc: ["high", "performance", "computing"],
  rtl: ["verilog", "systemverilog", "hardware"],
  fpga: ["hardware", "rtl"],
  asic: ["hardware", "silicon"],
  vlsi: ["hardware", "silicon"],
  eda: ["hardware", "silicon"],
  soc: ["hardware", "silicon"],
  sql: ["database"],
  db: ["database"],
  api: ["backend", "service"],
  rest: ["api", "backend"],
  frontend: ["ui", "react", "web"],
  backend: ["server", "service", "api"],
  infra: ["infrastructure", "devops"],
  devops: ["infrastructure"],
  pytorch: ["torch", "deep", "learning"],
  tensorflow: ["deep", "learning"],
  jax: ["deep", "learning"],
  sre: ["reliability", "infrastructure"],
  qa: ["testing", "test"],
  distributed: ["parallel", "cluster"],
  inference: ["serving", "latency"],
  training: ["train", "finetune", "finetuning"],
  optimization: ["optimisation", "performance", "speedup"],
  optimisation: ["optimization", "performance", "speedup"],
};

/** The tokens of `s`, plus whatever the alias table says they also mean. */
export function expand(s: string): string[] {
  const base = tokenize(s);
  const out = [...base];
  for (const t of base) {
    const more = ALIASES[t];
    if (more) out.push(...more);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * the corpus
 * ------------------------------------------------------------------ */

/**
 * Every line of the library that could carry a claim about ability. Entry
 * headings are deliberately not documents of their own — an entry gets onto
 * the page because one of its bullets earned it, never on the strength of a
 * company name.
 */
export function corpus(db: DB): Doc[] {
  const docs: Doc[] = [];
  for (const e of db.entries) {
    const context = [e.org, e.title].filter(Boolean).join(" ");
    for (const b of e.bullets) {
      docs.push({
        id: b.id,
        kind: "bullet",
        entryId: e.id,
        entryKind: e.kind,
        text: b.text,
        context,
        /* a bullet inherits its entry's tags: tagging the entry "ml" is how
           people actually use the vocabulary, and re-tagging every bullet
           underneath it is work nobody does */
        tags: [...new Set([...b.tags, ...e.tags])],
      });
    }
  }
  for (const s of db.skills) {
    docs.push({
      id: s.id,
      kind: "skill",
      entryId: "",
      entryKind: "",
      text: `${s.label}: ${s.items}`,
      context: "",
      tags: s.tags,
    });
  }
  return docs;
}

/* ------------------------------------------------------------------ *
 * BM25
 * ------------------------------------------------------------------ */

const K1 = 1.4;
const B = 0.72;

export interface Index {
  docs: Doc[];
  /** term -> how many documents contain it */
  df: Map<string, number>;
  /** per document, term -> count */
  tf: Map<string, number>[];
  len: number[];
  avgLen: number;
}

export function buildIndex(docs: Doc[]): Index {
  const df = new Map<string, number>();
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  for (const d of docs) {
    /* the entry heading is indexed at a lower weight than the bullet itself —
       it is context, not a claim, so it should break ties and not decide them */
    const terms = [...expand(d.text), ...expand(d.context).slice(0, 12), ...d.tags.map((t) => t.toLowerCase())];
    const counts = new Map<string, number>();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    len.push(terms.length);
  }
  const avgLen = len.length ? len.reduce((a, b) => a + b, 0) / len.length : 0;
  return { docs, df, tf, len, avgLen };
}

export interface Hit {
  doc: Doc;
  score: number;
  /** the query terms this document actually matched, for showing your work */
  matched: string[];
  /**
   * How much of the query's *information* this document accounted for: the idf
   * of the terms it matched over the idf of every term asked for, 0..1.
   *
   * Unlike the BM25 score this is absolute and comparable across queries, which
   * is the property that matters when the question is "is this evidence?"
   * rather than "which of these is best?". Weighting by idf is what stops a
   * line that happens to share the word "systems" from reading as a half-match:
   * a term the whole corpus contains carries almost none of what the
   * requirement was asking about.
   */
  cover: number;
}

/**
 * BM25 with the standard `log(1 + (N - df + 0.5)/(df + 0.5))` idf, which never
 * goes negative — the textbook form does, and a term appearing in more than
 * half the corpus would otherwise *subtract* from the score of a document that
 * has it.
 */
export function search(index: Index, query: string, opts: { tags?: string[]; limit?: number } = {}): Hit[] {
  const { docs, df, tf, len, avgLen } = index;
  const qTerms = [...new Set(expand(query))];
  if (!qTerms.length || !docs.length) return [];
  const N = docs.length;
  const want = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));

  const idfOf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };
  /* Terms the corpus does not contain stay in the denominator, and at df 0 the
     idf formula gives them its maximum. That is the whole point: a requirement
     written in vocabulary this library never uses is one nothing here answers,
     and every document should score near zero against it. Dropping those terms
     instead — an earlier version of this line — left the denominator holding
     one incidental word, and handed a perfect cover to any document that
     happened to share it. */
  const askedIdf = qTerms.reduce((a, t) => a + idfOf(t), 0);

  const hits: Hit[] = docs.map((doc, i) => {
    let score = 0;
    let gotIdf = 0;
    const matched: string[] = [];
    for (const t of qTerms) {
      const f = tf[i].get(t);
      if (!f) continue;
      const idf = idfOf(t);
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * len[i]) / (avgLen || 1))));
      gotIdf += idf;
      matched.push(t);
    }
    const cover = askedIdf > 0 ? gotIdf / askedIdf : 0;
    /* a tag the JD asked for is a deliberate human judgement about this line,
       so it is worth more than one more lexical hit — but not enough to float
       an off-topic bullet above one that actually says the words */
    if (want.size) {
      const overlap = doc.tags.filter((t) => want.has(t.toLowerCase())).length;
      if (overlap) score += 1.5 * overlap;
    }
    return { doc, score, matched, cover };
  });

  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, opts.limit ?? 40);
}

/**
 * One shortlist per requirement, merged and de-duplicated, keeping each
 * document's best score and remembering which requirements it answered.
 *
 * Retrieving per requirement rather than against the whole JD at once is the
 * point: a posting that wants CUDA *and* React has two clusters of vocabulary,
 * and a single query blends them into a centroid that matches neither.
 */
export interface Candidate extends Hit {
  /** indices into the requirement list that retrieved this document */
  forReqs: number[];
  /**
   * Per requirement, how much of that requirement this document actually
   * covers — `Hit.cover`, kept per requirement rather than collapsed.
   *
   * Being retrieved for a requirement is not the same as answering it: the
   * eighth-best hit for "CUDA kernels" is on the shortlist because something
   * had to be. Ranking cannot tell those apart, and neither can normalising
   * against the best hit of the same query — that hands a perfect score to the
   * top result no matter how weak the whole field is, which is exactly the case
   * a résumé needs told about. `cover` is absolute, so a requirement nothing in
   * the library speaks to scores low across the board and is reported as a gap.
   */
  perReq: Record<number, number>;
}

export function retrieve(
  index: Index,
  requirements: string[],
  opts: { tags?: string[]; perReq?: number; limit?: number } = {}
): Candidate[] {
  const width = opts.perReq ?? 8;
  const byId = new Map<string, Candidate>();
  requirements.forEach((req, i) => {
    for (const h of search(index, req, { tags: opts.tags, limit: width })) {
      const prev = byId.get(h.doc.id);
      if (prev) {
        prev.score = Math.max(prev.score, h.score);
        prev.cover = Math.max(prev.cover, h.cover);
        prev.forReqs.push(i);
        prev.perReq[i] = Math.max(prev.perReq[i] ?? 0, h.cover);
        prev.matched = [...new Set([...prev.matched, ...h.matched])];
      } else {
        byId.set(h.doc.id, { ...h, forReqs: [i], perReq: { [i]: h.cover } });
      }
    }
  });
  return [...byId.values()]
    .sort((a, b) => b.forReqs.length - a.forReqs.length || b.score - a.score)
    .slice(0, opts.limit ?? 60);
}

/**
 * How much of a requirement a line has to cover before it is called evidence
 * for it.
 *
 * Set by `lib/eval/` rather than by feel. The whole answer key, retrieval only:
 *
 * ```
 *   STRONG   recall   precision   traps   gap calls
 *    0.08      86%        51%       0%       100%
 *    0.10      77%        57%       0%       100%
 *    0.12      68%        60%       0%       100%
 *    0.14      55%        71%       0%        88%
 *    0.16      55%        71%       0%        88%
 *    0.20      50%        69%       0%        82%
 * ```
 *
 * 0.14 over the 0.2 this used to be, because 0.2 is beaten on every column at
 * once — it was not a precision/recall trade, it was just too strict. 0.14 over
 * the looser end because of which mistake costs more: a line wrongly cited as
 * evidence is a claim on a résumé that an interview will test, while a line
 * that misses the cut is usually still on the page as filler and is listed
 * under "did not fit" either way.
 *
 * The 12% of gap calls still wrong at 0.14 are all in the `vocabulary-gap`
 * case, which is in the key precisely because lexical matching cannot do it.
 * Re-measure with `npm run eval` after touching ALIASES, the BM25 constants, or
 * the way `cover` is computed — all three move this.
 */
export const STRONG = 0.14;

/** Bullets grouped under the entry they belong to — what the packer works in. */
export function byEntry(db: DB, cands: Candidate[]): Map<Entry, Candidate[]> {
  const byId = new Map(db.entries.map((e) => [e.id, e]));
  const out = new Map<Entry, Candidate[]>();
  for (const c of cands) {
    const e = byId.get(c.doc.entryId);
    if (!e) continue;
    const list = out.get(e);
    if (list) list.push(c);
    else out.set(e, [c]);
  }
  return out;
}

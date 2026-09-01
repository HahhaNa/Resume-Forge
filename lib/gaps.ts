/* ------------------------------------------------------------------ *
 * What the applications log already knows.
 *
 * The Tailor tab answers one posting at a time: here is what this role
 * asked for, here is what your library answers, here is what it does
 * not. Useful, and forgotten by the next posting. This file asks the
 * same question of *every* posting on the applications log at once,
 * which turns a per-role report into two answers nothing else here can
 * give — **what should I build next**, and **which roles am I already a
 * fit for**.
 *
 * Two decisions carry the whole file.
 *
 * **A gap is not one thing.** `tailor()` reports a requirement as a gap
 * when nothing *on the page* answers it, and that conflates two
 * situations with opposite remedies: the library has nothing to say
 * (go and do the work, or find the line you never wrote down) versus
 * the library answers it and the line lost its place to something
 * better (trim the page, or send a different variant). Aggregated over
 * twenty postings the difference is the entire value of the exercise,
 * so `Answer` keeps the three cases apart.
 *
 * **Counting requirements verbatim counts nothing.** Twelve postings
 * asking for "CUDA kernel optimisation", "GPU performance work" and
 * "experience writing CUDA" are one thing you keep failing, and a
 * report that lists them separately says only that job adverts are
 * written by different people. So near-identical requirements are
 * folded into a theme first, and the count is of *postings* per theme.
 * Nothing here calls a model to do that: `expand` already folds this
 * domain's synonyms, the comparison is set overlap, and a clustering
 * rule you can read is worth more than a better one you cannot check.
 * ------------------------------------------------------------------ */

import { expand } from "./retrieve";
import type { Requirement, TailorResult } from "./agent";

/**
 * Where a posting's requirement was answered.
 *
 * - `page`   — a line answering it made the tailored page
 * - `library` — you have a line for it; the packer had no room
 * - `none`   — nothing you have written answers it
 *
 * Only `none` is a reason to go and build something. Reporting the other
 * two as one number is how a gap list turns into a to-do list of things
 * you have already done.
 */
export type Answer = "page" | "library" | "none";

/** One requirement of one posting, and how it fared. */
export interface Asked {
  req: Requirement;
  answer: Answer;
}

/** One posting's run, reduced to what aggregation needs. */
export interface PostingRun {
  appId: string;
  company: string;
  role: string;
  asked: Asked[];
}

/**
 * A tailor run, read as one posting's contribution to the aggregate.
 *
 * `coverage` is what reached the page. `judged` is everything the run
 * scored, whether or not it fitted — which is the only place the
 * "you have this, it did not fit" case can be read from.
 */
export function summarise(
  app: { id: string; company: string; role: string },
  res: Pick<TailorResult, "requirements" | "coverage" | "judged">
): PostingRun {
  const inLibrary = new Set<number>();
  for (const j of res.judged) for (const i of j.reqs) inLibrary.add(i);
  return {
    appId: app.id,
    company: app.company,
    role: app.role,
    asked: res.requirements.map((req, i) => ({
      req,
      answer: (res.coverage.get(i)?.length ?? 0) > 0 ? "page" : inLibrary.has(i) ? "library" : "none",
    })),
  };
}

/* ------------------------------------------------------------------ *
 * folding many phrasings into one ask
 * ------------------------------------------------------------------ */

/**
 * Filler that `retrieve.ts` is right to keep and this file cannot.
 *
 * BM25 needs no defence against a word that appears everywhere: IDF gives
 * it almost no weight, so leaving it in the index costs nothing. Set
 * overlap has no IDF — every shared term counts the same — so "5+ years
 * of Python" and "5+ years of Java" share two of three terms and merge
 * into one ask, which is exactly wrong. The filtering belongs here rather
 * than in `STOP`, where it would move every retrieval score, and the eval
 * report with them, to fix a problem only this file has.
 *
 * Bare numbers go too: `5+` and `10` say how much, never what. Anything
 * with a letter in it stays, so `3d`, `8-bit` and `h100` survive.
 */
const FILLER = new Set([
  "of", "to", "in", "on", "at", "by", "as", "is", "it", "or", "an", "be", "we", "us", "do", "if",
  "so", "up", "no",
]);

/**
 * The terms that decide whether two requirements are the same ask.
 *
 * The model's own keywords go in alongside the text: they are its
 * normalisation of the requirement into the words a résumé would use,
 * which is exactly the vocabulary two postings are most likely to agree
 * on even when their prose does not.
 */
export function keyTerms(r: Requirement): string[] {
  return [
    ...new Set(
      expand([r.text, ...(r.keywords ?? [])].join(" ")).filter(
        (t) => !FILLER.has(t) && !/^\d+\+?$/.test(t)
      )
    ),
  ];
}

/**
 * How much of the shorter requirement the two have to share.
 *
 * Set by what the two failure modes cost. Too strict and every posting's
 * phrasing is its own theme, every count is 1, and the report says
 * nothing it did not already say one posting at a time. Too loose and
 * everything collapses into "engineering" — one theme, asked twelve
 * times, useless. Half of the shorter side is the point where the
 * postings that genuinely rhyme merge and the ones that merely share a
 * word do not.
 */
export const SAME_ASK = 0.5;

/** Requirements are compared on the shorter side, so a verbose posting
 *  and a terse one still meet. Two shared terms are required outright —
 *  one word in common is a coincidence — unless the shorter side only
 *  has one term to give, where a full match is all there is. */
function sameAsk(a: Set<string>, b: Set<string>): boolean {
  const min = Math.min(a.size, b.size);
  if (!min) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared >= Math.min(2, min) && shared / min >= SAME_ASK;
}

/** For a requirement with no terms at all — "5+ years", "a strong team
 *  player" — where overlap has nothing to work with and identical text
 *  is the only honest reason to merge two of them. */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ *
 * the aggregate
 * ------------------------------------------------------------------ */

/** One posting's take on a theme, folded to its best outcome. */
export interface ThemeHit {
  appId: string;
  company: string;
  role: string;
  /** how this posting phrased it */
  text: string;
  kind: "must" | "nice";
  answer: Answer;
}

export interface Theme {
  /** stable across runs on the same data — the canonical terms, or the text */
  id: string;
  /** the phrasing to show: the one used most often, shortest to break a tie */
  label: string;
  terms: string[];
  /** one per posting that asked, best outcome first */
  hits: ThemeHit[];
  asked: number;
  onPage: number;
  inLibrary: number;
  missing: number;
  /** of the postings that answered none of it, how many called it required */
  missingMusts: number;
}

/** How well one posting's requirements were answered, on the page. */
export interface Fit {
  appId: string;
  company: string;
  role: string;
  total: number;
  answered: number;
  musts: number;
  mustsAnswered: number;
  /**
   * The share answered, with a required thing counted twice.
   *
   * Failing something the posting called required is not the same as
   * failing something it merely preferred, and a single ordering has to
   * say which it cares about. Weighting is the smallest way to say it:
   * a `must` puts 2 in the denominator, a `nice` puts 1.
   */
  score: number;
}

export interface Aggregate {
  /** postings that were read — the denominator for every count below */
  postings: number;
  /** requirements read across all of them, before folding */
  requirements: number;
  /** ranked by what you keep failing to answer */
  themes: Theme[];
  /** ranked by how completely the page answered the posting */
  fits: Fit[];
}

const RANK: Record<Answer, number> = { page: 2, library: 1, none: 0 };

/**
 * Every posting's run, folded into themes and per-posting fit.
 *
 * Deterministic: clustering walks the runs in the order given and the
 * first requirement of a theme is its leader, so a theme never drifts
 * as members are added and the same input always gives the same report.
 */
export function aggregate(runs: PostingRun[]): Aggregate {
  interface Cluster {
    terms: string[];
    set: Set<string>;
    /** only consulted when there are no terms to compare */
    fallback: string;
    texts: string[];
    hits: ThemeHit[];
  }
  const clusters: Cluster[] = [];
  let requirements = 0;

  for (const run of runs) {
    for (const { req, answer } of run.asked) {
      requirements++;
      const terms = keyTerms(req);
      const set = new Set(terms);
      const fallback = norm(req.text);
      const found = clusters.find((c) =>
        terms.length && c.set.size ? sameAsk(set, c.set) : !terms.length && !c.set.size && c.fallback === fallback
      );
      const hit: ThemeHit = {
        appId: run.appId,
        company: run.company,
        role: run.role,
        text: req.text,
        kind: req.kind === "must" ? "must" : "nice",
        answer,
      };
      if (found) {
        found.texts.push(req.text);
        found.hits.push(hit);
      } else {
        clusters.push({ terms, set, fallback, texts: [req.text], hits: [hit] });
      }
    }
  }

  const themes = clusters.map<Theme>((c) => {
    /* One posting asking for the same thing twice is one posting, and it
       counts as answered if either phrasing was — so the hits are folded
       per application, keeping the best outcome and the stronger kind. */
    const byApp = new Map<string, ThemeHit>();
    for (const h of c.hits) {
      const prev = byApp.get(h.appId);
      if (!prev) byApp.set(h.appId, h);
      else
        byApp.set(h.appId, {
          ...prev,
          answer: RANK[h.answer] > RANK[prev.answer] ? h.answer : prev.answer,
          kind: prev.kind === "must" || h.kind === "must" ? "must" : "nice",
        });
    }
    const hits = [...byApp.values()].sort((a, b) => RANK[b.answer] - RANK[a.answer]);
    const count = (a: Answer) => hits.filter((h) => h.answer === a).length;
    return {
      id: c.terms.length ? c.terms.join(" ") : c.fallback,
      label: pickLabel(c.texts),
      terms: c.terms,
      hits,
      asked: hits.length,
      onPage: count("page"),
      inLibrary: count("library"),
      missing: count("none"),
      missingMusts: hits.filter((h) => h.answer === "none" && h.kind === "must").length,
    };
  });

  /* The question is "what do I keep failing", so the count of postings
     nothing answered leads. Required-and-missing breaks the tie, then how
     often it came up at all; the label last, so the order never depends on
     which posting happened to be read first. */
  themes.sort(
    (a, b) =>
      b.missing - a.missing ||
      b.missingMusts - a.missingMusts ||
      b.asked - a.asked ||
      a.label.localeCompare(b.label)
  );

  const fits = runs
    .map<Fit>((run) => {
      const musts = run.asked.filter((x) => x.req.kind === "must");
      const mustsAnswered = musts.filter((x) => x.answer === "page").length;
      const answered = run.asked.filter((x) => x.answer === "page").length;
      const weight = run.asked.length + musts.length;
      return {
        appId: run.appId,
        company: run.company,
        role: run.role,
        total: run.asked.length,
        answered,
        musts: musts.length,
        mustsAnswered,
        score: weight ? (answered + mustsAnswered) / weight : 0,
      };
    })
    .sort((a, b) => b.score - a.score || b.total - a.total || a.company.localeCompare(b.company));

  return { postings: runs.length, requirements, themes, fits };
}

/** The phrasing used most often; the shortest of them if that ties, which
 *  is the one least likely to carry one posting's private vocabulary. */
function pickLabel(texts: string[]): string {
  const n = new Map<string, number>();
  for (const t of texts) n.set(t, (n.get(t) ?? 0) + 1);
  return (
    [...n.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0])
    )[0]?.[0] ?? ""
  );
}

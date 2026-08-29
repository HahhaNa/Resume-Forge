/* ------------------------------------------------------------------ *
 * Turning a run into numbers.
 *
 * Everything here is counts, never pre-divided rates. Averaging four
 * per-case percentages weights a case with two requirements the same
 * as one with six, and the four-requirement off-domain case would then
 * carry as much of the headline as the whole of the rest. Carrying
 * hit/of pairs around means the totals are micro-averages — every
 * labelled pair counts once, wherever it came from.
 * ------------------------------------------------------------------ */

export interface Ratio {
  hit: number;
  of: number;
}

export const ratio = (hit = 0, of = 0): Ratio => ({ hit, of });

export const add = (a: Ratio, b: Ratio): Ratio => ({ hit: a.hit + b.hit, of: a.of + b.of });

/** A ratio with nothing in it is not 0% — it is "not measured", and prints as such. */
export const rate = (r: Ratio): number | null => (r.of ? r.hit / r.of : null);

export const pct = (r: Ratio): string => {
  const v = rate(r);
  return v === null ? "  — " : `${Math.round(v * 100).toString().padStart(3)}%`;
};

/** `requirement 2 → ml-train`, the form both miss lists print in. */
export const pair = (req: number, id: string) => `${req}→${id}`;

export interface Metrics {
  /**
   * Of the lines the key calls evidence, how many reached the shortlist at all.
   * The ceiling on everything downstream: a line that was never retrieved
   * cannot be judged, cannot be packed, and cannot be cited.
   */
  shortlist: Ratio;
  /** Of the lines the key calls evidence, how many were credited to that requirement. */
  recall: Ratio;
  /** Of the lines credited to a requirement, how many the key agrees with. */
  precision: Ratio;
  /** Of the labelled traps, how many were credited. Lower is better. */
  traps: Ratio;
  /** Of the requirements, how many had their gap / not-gap called correctly. */
  gaps: Ratio;
}

export const NO_METRICS = (): Metrics => ({
  shortlist: ratio(),
  recall: ratio(),
  precision: ratio(),
  traps: ratio(),
  gaps: ratio(),
});

export const mergeMetrics = (a: Metrics, b: Metrics): Metrics => ({
  shortlist: add(a.shortlist, b.shortlist),
  recall: add(a.recall, b.recall),
  precision: add(a.precision, b.precision),
  traps: add(a.traps, b.traps),
  gaps: add(a.gaps, b.gaps),
});

export interface Labels {
  answers: string[];
  traps: string[];
  /** the key says the library has nothing for this requirement */
  gap: boolean;
}

export interface Observed {
  /** doc ids the retriever put on the shortlist for this requirement */
  shortlisted: Set<string>;
  /** doc ids credited as evidence for this requirement */
  credited: Set<string>;
  /** whether the run reported this requirement as unanswered */
  reportedGap: boolean;
}

export interface CaseScore {
  metrics: Metrics;
  /** evidence that was never retrieved — the failures nothing downstream can fix */
  neverFound: string[];
  /** evidence that was retrieved and then not credited */
  notCredited: string[];
  /** lines credited that the key does not call evidence */
  overClaimed: string[];
  /** traps that were credited — over-claims the key predicted in advance */
  sprung: string[];
}

/**
 * One requirement at a time, because that is the unit everything is labelled in.
 *
 * Precision is scored exhaustively: anything credited that `answers` does not
 * list counts against it, whether or not the key predicted that particular
 * mistake. The fixture is fifteen documents, so "everything else is not
 * evidence" is a claim the key can actually make — and a precision number that
 * only counted the mistakes someone thought of in advance would sit at 100%
 * while a loosened threshold quietly credited half the corpus. `traps` stays
 * as the sharper, narrower measure: the over-claims that were predicted.
 */
export function scoreCase(rows: { labels: Labels; observed: Observed }[]): CaseScore {
  const out: CaseScore = {
    metrics: NO_METRICS(),
    neverFound: [],
    notCredited: [],
    overClaimed: [],
    sprung: [],
  };

  rows.forEach(({ labels, observed }, req) => {
    for (const id of labels.answers) {
      const found = observed.shortlisted.has(id);
      out.metrics.shortlist = add(out.metrics.shortlist, ratio(found ? 1 : 0, 1));
      const credited = observed.credited.has(id);
      out.metrics.recall = add(out.metrics.recall, ratio(credited ? 1 : 0, 1));
      if (!found) out.neverFound.push(pair(req, id));
      else if (!credited) out.notCredited.push(pair(req, id));
    }

    for (const id of labels.traps) {
      const credited = observed.credited.has(id);
      out.metrics.traps = add(out.metrics.traps, ratio(credited ? 1 : 0, 1));
      if (credited) out.sprung.push(pair(req, id));
    }

    const answers = new Set(labels.answers);
    const traps = new Set(labels.traps);
    for (const id of observed.credited) {
      const right = answers.has(id);
      out.metrics.precision = add(out.metrics.precision, ratio(right ? 1 : 0, 1));
      /* a sprung trap is already listed above; this list is for the rest */
      if (!right && !traps.has(id)) out.overClaimed.push(pair(req, id));
    }

    const right = labels.gap === observed.reportedGap;
    out.metrics.gaps = add(out.metrics.gaps, ratio(right ? 1 : 0, 1));
  });

  return out;
}

/**
 * The eval, run as part of the ordinary test suite.
 *
 * It belongs here rather than in a script somebody remembers to run: retrieval
 * mode needs no key and no network and takes about a fifth of a second, so
 * there is no reason for a change that quietly halves matching quality to reach
 * a commit. `npm run eval` prints the same report in full when you are tuning.
 *
 * The floors below sit a little under what the system currently scores. They
 * are a ratchet against regression, not a target: a change that moves a number
 * up should move its floor up with it, and a change that moves one down should
 * have to say so out loud in the diff rather than silently pass.
 */
import { describe, expect, it } from "vitest";
import { CASES } from "./eval/cases";
import { ceiling, danglingIds, formatReport, runEval, settingsFromEnv } from "./eval/run";
import { rate } from "./eval/score";
import type { Metrics } from "./eval/score";

/* model mode is opt-in and costs money, so it turns on only when the
   environment names a model — which CI never does */
const settings = settingsFromEnv(process.env);
const report = await runEval(settings ? { settings } : {});

const at = (m: Metrics, k: keyof Metrics) => rate(m[k]) ?? 1;

describe("the answer key", () => {
  it("names only lines that exist in the fixture", () => {
    expect(danglingIds()).toEqual([]);
  });

  it("labels something for every case", () => {
    for (const c of CASES) expect(c.requirements.length).toBeGreaterThan(0);
  });

  /* a key where every requirement is answerable would never exercise the one
     output that makes this tab worth having */
  it("includes requirements the library genuinely cannot answer", () => {
    const gaps = CASES.flatMap((c) => c.requirements).filter((r) => !r.answers.length);
    expect(gaps.length).toBeGreaterThan(3);
  });
});

describe("retrieval", () => {
  it("puts every labelled answer in front of the judges", () => {
    /* the ceiling on everything else: nothing downstream can recover a line
       that was never retrieved, so this one is held at 100% */
    for (const c of CASES) {
      const { hit, of } = ceiling(c);
      expect(`${c.name} ${hit}/${of}`).toBe(`${c.name} ${of}/${of}`);
    }
  });
});

describe("matching", () => {
  it("credits over half the evidence", () => {
    expect(at(report.total, "recall")).toBeGreaterThanOrEqual(0.52);
  });

  it("is right about two thirds of what it credits", () => {
    expect(at(report.total, "precision")).toBeGreaterThanOrEqual(0.68);
  });

  /* the over-claims the key predicted in advance — the ones that put a
     sentence on a résumé that the interview then tests */
  it("springs none of the labelled traps", () => {
    expect(at(report.total, "traps")).toBeLessThanOrEqual(0.05);
  });

  it("calls the gaps right almost everywhere", () => {
    expect(at(report.total, "gaps")).toBeGreaterThanOrEqual(0.85);
  });

  it("never credits anything for a posting from another profession", () => {
    const off = report.cases.find((c) => c.name === "off-domain");
    expect(at(off!.metrics, "gaps")).toBe(1);
    expect(off!.overClaimed).toEqual([]);
  });

  /* Kept as a measurement rather than a wish. The docs say lexical matching
     cannot do this and that a model is what fixes it; if retrieval alone ever
     starts passing, the docs are wrong and should be corrected rather than the
     case quietly deleted. Skipped under a model, where passing is the hope. */
  it.skipIf(report.mode === "model")("still cannot cross the vocabulary gap on its own", () => {
    const vg = report.cases.find((c) => c.name === "vocabulary-gap");
    expect(at(vg!.metrics, "recall")).toBeLessThan(0.5);
  });
});

it("prints the report", () => {
  console.log(`\n${formatReport(report)}\n`);
});

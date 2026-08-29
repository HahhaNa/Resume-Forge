/**
 * The whole feature, end to end, with no model connected.
 *
 * This is the path that has to work for someone who has pasted no key at all,
 * and it is the one a unit test cannot reach: the graph really runs, retrieval
 * really searches the starter library, and the packer really fills a page. It
 * also pins the two things that were wrong the first time it was tried by hand
 * — a requirement stated as "familiarity with" being dropped on the floor, and
 * a barely-related bullet being counted as evidence.
 */
import { describe, expect, it } from "vitest";
import { tailor } from "./agent";
import { estimatePages } from "./fit";
import { resolve } from "./resume";
import { SEED } from "./seed";
import { BLANK } from "./llm";

const JD = `Senior ML Systems Engineer

San Francisco, CA · $200,000 - $260,000

What you'll do
- Strong experience writing CUDA kernels and profiling GPU workloads
- Deep familiarity with distributed training of large language models across multi-node clusters
- Proficiency in PyTorch internals, including custom autograd and memory layout
- Ability to reduce inference latency for transformer serving in production
- Experience with C++ and Python in performance-critical code paths
- Familiarity with Verilog or hardware accelerator design is preferred

We are an equal opportunity employer and value diversity at our company.`;

const base = SEED.variants[0];

const run = () =>
  tailor({
    db: SEED,
    base,
    jd: JD,
    settings: BLANK,
    pinnedEntryIds: SEED.entries.filter((e) => e.kind === "education").map((e) => e.id),
  });

describe("tailor, with no model connected", () => {
  it("reads every requirement the posting states", async () => {
    const out = await run();
    expect(out.requirements).toHaveLength(6);
    expect(out.requirements.filter((r) => r.kind === "nice")).toHaveLength(1);
  });

  it("says so rather than pretending a model ran", async () => {
    expect((await run()).offline).toBe(true);
  });

  it("fills a page without spilling onto a second", async () => {
    const out = await run();
    expect(out.result.fill).toBeGreaterThan(0.6);
    expect(out.result.fill).toBeLessThanOrEqual(1);
  });

  it("produces a variant the résumé tab measures the same way", async () => {
    const out = await run();
    const v = { ...base, sections: out.result.sections, bulletIds: out.result.bulletIds };
    expect(estimatePages(resolve(SEED, v), base)).toBeCloseTo(out.result.fill, 6);
  });

  it("only puts bullets on the page that the library actually has", async () => {
    const out = await run();
    const known = new Set(SEED.entries.flatMap((e) => e.bullets.map((b) => b.id)));
    for (const id of out.result.bulletIds) expect(known.has(id)).toBe(true);
  });

  /**
   * The property that keeps the coverage report honest, stated as a contrast
   * rather than as a threshold: a library is allowed to answer a posting in its
   * own field, and must not answer one from another profession. Matching on
   * rank alone passes the first half and fails the second — every requirement
   * has a best hit, however bad the field.
   */
  it("answers what it can and reports the rest as gaps", async () => {
    const out = await run();
    expect(out.requirements.length - out.gaps.length).toBeGreaterThan(0);
    /* the starter library has no transformer-serving work, and saying so is the
       point — a stretched match here is what puts a claim on a résumé */
    expect(out.gaps.length).toBeGreaterThan(0);
  });

  it("answers nothing at all in a posting from another profession", async () => {
    const out = await tailor({
      db: SEED,
      base,
      settings: BLANK,
      jd: `Registered Nurse, Paediatric Oncology
- Experience administering chemotherapy and managing infusion reactions
- Strong background in paediatric palliative care and family counselling
- Proficiency in phlebotomy, cannulation and wound dressing
- Ability to interpret haematology panels and escalate to the attending physician
- Familiarity with electronic health records and HIPAA documentation is preferred`,
    });
    expect(out.gaps).toHaveLength(out.requirements.length);
  });

  /**
   * The bug this pins: coverage was decided by two different thresholds on two
   * different scales, so a requirement could be reported as a gap while the
   * evidence for it was sitting on the finished page.
   */
  it("never calls a requirement a gap when the page already answers it", async () => {
    const out = await run();
    const gaps = new Set(out.gaps.map((g) => out.requirements.indexOf(g)));
    for (const [req, ids] of out.coverage) {
      if (ids.length) expect(gaps.has(req)).toBe(false);
    }
  });

  it("only cites lines that are actually on the page", async () => {
    const out = await run();
    const on = new Set(out.result.chosen);
    for (const ids of out.coverage.values()) for (const id of ids) expect(on.has(id)).toBe(true);
  });

  it("records the steps it took", async () => {
    const names = (await run()).steps.map((s) => s.name);
    expect(names.slice(0, 5)).toEqual(["read", "recall", "judge", "fit", "critique"]);
  });
});

import { describe, expect, it } from "vitest";
import { aggregate, keyTerms, summarise, type PostingRun } from "./gaps";
import type { Judged, Requirement } from "./agent";
import type { Doc } from "./retrieve";

const req = (text: string, kind: "must" | "nice" = "must", keywords: string[] = []): Requirement => ({
  text,
  kind,
  keywords,
});

const doc = (id: string, text: string): Doc => ({
  id,
  kind: "bullet",
  entryId: "e1",
  entryKind: "experience",
  text,
  context: "",
  tags: [],
});

const judged = (id: string, reqs: number[]): Judged => ({ doc: doc(id, id), id, score: 1, reqs });

/** One posting's worth of runs, written the way the aggregate reads them. */
const run = (appId: string, company: string, asked: PostingRun["asked"]): PostingRun => ({
  appId,
  company,
  role: "Engineer",
  asked,
});

describe("summarise", () => {
  it("separates what reached the page from what only exists in the library", () => {
    const out = summarise(
      { id: "a1", company: "Acme", role: "ML" },
      {
        requirements: [req("CUDA kernels"), req("distributed training"), req("Rust")],
        coverage: new Map([
          [0, ["b1"]],
          [1, []],
          [2, []],
        ]),
        /* the line for requirement 1 was scored but never fitted */
        judged: [judged("b1", [0]), judged("b2", [1])],
      }
    );
    expect(out.asked.map((x) => x.answer)).toEqual(["page", "library", "none"]);
  });

  it("treats a requirement nothing was judged against as unanswered, not unknown", () => {
    const out = summarise(
      { id: "a1", company: "Acme", role: "ML" },
      { requirements: [req("Fortran")], coverage: new Map(), judged: [] }
    );
    expect(out.asked[0].answer).toBe("none");
  });
});

describe("keyTerms", () => {
  it("folds the abbreviations two postings spell differently", () => {
    // ALIASES: gpu -> cuda, ml -> machine learning
    expect(keyTerms(req("GPU work"))).toContain("cuda");
    expect(keyTerms(req("ML infrastructure"))).toContain("learning");
  });

  it("takes the model's keywords as part of the ask", () => {
    expect(keyTerms(req("inference speed", "must", ["tensorrt"]))).toContain("tensorrt");
  });

  it("has nothing to work with when a requirement is all filler", () => {
    expect(keyTerms(req("5+ years of experience"))).toEqual([]);
  });

  it("keeps a two-letter language rather than reading it as filler", () => {
    expect(keyTerms(req("Go and Rust"))).toContain("go");
  });

  it("keeps a term that leads with a digit but says something", () => {
    expect(keyTerms(req("8-bit quantisation"))).toContain("8-bit");
  });
});

describe("aggregate — folding phrasings into one ask", () => {
  it("counts three phrasings of the same thing as one theme asked three times", () => {
    const a = req("CUDA kernel optimisation", "must", ["cuda", "kernel"]);
    const b = req("optimising CUDA kernels", "must", ["cuda", "kernel"]);
    const c = req("write CUDA kernels", "must", ["cuda", "kernel"]);
    const out = aggregate([
      run("a1", "Acme", [{ req: a, answer: "none" }]),
      run("a2", "Globex", [{ req: b, answer: "none" }]),
      run("a3", "Initech", [{ req: c, answer: "none" }]),
    ]);
    expect(out.themes).toHaveLength(1);
    expect(out.themes[0].asked).toBe(3);
    expect(out.themes[0].missing).toBe(3);
  });

  it("keeps two genuinely different asks apart", () => {
    const out = aggregate([
      run("a1", "Acme", [
        { req: req("CUDA kernel optimisation", "must", ["cuda"]), answer: "none" },
        { req: req("technical writing", "nice", ["documentation"]), answer: "none" },
      ]),
    ]);
    expect(out.themes).toHaveLength(2);
  });

  it("does not let a shared \"5+ years of\" merge two different asks", () => {
    const out = aggregate([
      run("a1", "Acme", [{ req: req("5+ years of Python", "must", []), answer: "none" }]),
      run("a2", "Globex", [{ req: req("5+ years of Java", "must", []), answer: "none" }]),
    ]);
    expect(out.themes).toHaveLength(2);
  });

  it("does not merge on a single word in common", () => {
    // both mention Python and nothing else — one shared term is a coincidence
    const out = aggregate([
      run("a1", "Acme", [{ req: req("Python data pipelines", "must", []), answer: "none" }]),
      run("a2", "Globex", [{ req: req("Python web services", "must", []), answer: "none" }]),
    ]);
    expect(out.themes).toHaveLength(2);
  });

  it("merges a bare term with the same bare term", () => {
    const out = aggregate([
      run("a1", "Acme", [{ req: req("Verilog", "must", []), answer: "none" }]),
      run("a2", "Globex", [{ req: req("Verilog", "must", []), answer: "page" }]),
    ]);
    expect(out.themes).toHaveLength(1);
    expect(out.themes[0].asked).toBe(2);
  });

  it("shows the phrasing used most often, not the first one seen", () => {
    const long = req("deep familiarity with CUDA kernel optimisation", "must", ["cuda", "kernel"]);
    const plain = req("CUDA kernels", "must", ["cuda", "kernel"]);
    const out = aggregate([
      run("a1", "Acme", [{ req: long, answer: "none" }]),
      run("a2", "Globex", [{ req: plain, answer: "none" }]),
      run("a3", "Initech", [{ req: plain, answer: "none" }]),
    ]);
    expect(out.themes[0].label).toBe("CUDA kernels");
  });

  it("counts postings, not requirements, when one posting asks twice", () => {
    const out = aggregate([
      run("a1", "Acme", [
        { req: req("CUDA kernel optimisation", "must", ["cuda", "kernel"]), answer: "none" },
        { req: req("optimising CUDA kernels", "must", ["cuda", "kernel"]), answer: "page" },
      ]),
    ]);
    expect(out.themes[0].asked).toBe(1);
    // one phrasing was answered, so the posting is not a failure on this theme
    expect(out.themes[0].onPage).toBe(1);
    expect(out.themes[0].missing).toBe(0);
    expect(out.requirements).toBe(2);
  });

  it("cannot cluster requirements that are all filler, but still merges identical ones", () => {
    const out = aggregate([
      run("a1", "Acme", [{ req: req("5+ years of experience"), answer: "none" }]),
      run("a2", "Globex", [{ req: req("5+ years of experience"), answer: "none" }]),
      run("a3", "Initech", [{ req: req("a strong team player"), answer: "none" }]),
    ]);
    expect(out.themes).toHaveLength(2);
    expect(out.themes[0].asked).toBe(2);
  });
});

describe("aggregate — what it ranks first", () => {
  const cuda = (kind: "must" | "nice" = "must") => req("CUDA kernels", kind, ["cuda", "kernel"]);
  const rust = () => req("Rust services", "must", ["rust", "service"]);

  it("puts what the most postings failed at the top", () => {
    const out = aggregate([
      run("a1", "Acme", [
        { req: cuda(), answer: "none" },
        { req: rust(), answer: "page" },
      ]),
      run("a2", "Globex", [
        { req: cuda(), answer: "none" },
        { req: rust(), answer: "none" },
      ]),
    ]);
    expect(out.themes[0].label).toBe("CUDA kernels");
    expect(out.themes[0].missing).toBe(2);
    expect(out.themes[1].missing).toBe(1);
  });

  it("does not count a requirement the library answers as something to go and build", () => {
    const out = aggregate([
      run("a1", "Acme", [{ req: cuda(), answer: "library" }]),
      run("a2", "Globex", [{ req: cuda(), answer: "library" }]),
    ]);
    expect(out.themes[0].missing).toBe(0);
    expect(out.themes[0].inLibrary).toBe(2);
  });

  it("separates a required miss from a preferred one", () => {
    const out = aggregate([
      run("a1", "Acme", [{ req: cuda("nice"), answer: "none" }]),
      run("a2", "Globex", [{ req: cuda("must"), answer: "none" }]),
    ]);
    expect(out.themes[0].missing).toBe(2);
    expect(out.themes[0].missingMusts).toBe(1);
  });

  it("is stable: the same runs in the same order give the same report", () => {
    const runs = [
      run("a1", "Acme", [{ req: cuda(), answer: "none" }]),
      run("a2", "Globex", [{ req: rust(), answer: "none" }]),
    ];
    expect(aggregate(runs).themes.map((x) => x.id)).toEqual(aggregate(runs).themes.map((x) => x.id));
  });
});

describe("aggregate — which roles you already fit", () => {
  it("ranks the posting your page answers most completely first", () => {
    const out = aggregate([
      run("a1", "Acme", [
        { req: req("A"), answer: "none" },
        { req: req("B"), answer: "none" },
      ]),
      run("a2", "Globex", [
        { req: req("C"), answer: "page" },
        { req: req("D"), answer: "page" },
      ]),
    ]);
    expect(out.fits[0].company).toBe("Globex");
    expect(out.fits[0].score).toBe(1);
    expect(out.fits[1].score).toBe(0);
  });

  it("weighs a required miss more heavily than a preferred one", () => {
    const strict = run("a1", "Acme", [
      { req: req("A", "must"), answer: "none" },
      { req: req("B", "nice"), answer: "page" },
    ]);
    const lenient = run("a2", "Globex", [
      { req: req("A", "must"), answer: "page" },
      { req: req("B", "nice"), answer: "none" },
    ]);
    const out = aggregate([strict, lenient]);
    expect(out.fits[0].company).toBe("Globex");
    expect(out.fits[0].mustsAnswered).toBe(1);
    expect(out.fits[1].mustsAnswered).toBe(0);
  });

  it("reports a posting nothing could be read from as a zero, not a crash", () => {
    const out = aggregate([run("a1", "Acme", [])]);
    expect(out.fits[0].score).toBe(0);
    expect(out.fits[0].total).toBe(0);
    expect(out.themes).toEqual([]);
  });

  it("has nothing to say about no postings at all", () => {
    expect(aggregate([])).toEqual({ postings: 0, requirements: 0, themes: [], fits: [] });
  });
});

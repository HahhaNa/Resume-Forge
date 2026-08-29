import { describe, expect, it } from "vitest";
import { corpusPrompt, extractJson, requirementPrompt, requirementsFromText, valueOf } from "./agent";
import type { Requirement } from "./agent";
import type { Doc } from "./retrieve";

describe("extractJson", () => {
  it("reads a bare object", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("reads through a fence", () => {
    expect(extractJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("reads through an apology in front of it", () => {
    expect(extractJson<{ a: number }>('Sure! Here is the JSON:\n{"a":1}')).toEqual({ a: 1 });
  });

  it("stops at the matching brace, not at a later one in prose", () => {
    expect(extractJson<{ a: number }>('{"a":1}\nHope that helps {see above}')).toEqual({ a: 1 });
  });

  it("keeps a brace that is inside a string", () => {
    expect(extractJson<{ a: string }>('{"a":"} not the end"}')).toEqual({ a: "} not the end" });
  });

  it("handles nesting", () => {
    expect(extractJson<{ a: { b: number[] } }>('{"a":{"b":[1,2]}}')).toEqual({ a: { b: [1, 2] } });
  });

  it("says so when there is no JSON at all", () => {
    expect(() => extractJson("I cannot help with that")).toThrow(/without any JSON/);
  });

  it("says so when the JSON was cut off", () => {
    expect(() => extractJson('{"a":')).toThrow(/cut off/);
  });
});

describe("requirementsFromText", () => {
  const JD = `Senior ML Engineer
San Francisco, CA · $180,000 - $220,000

What you'll do
- Experience with CUDA kernel programming and GPU profiling
- Strong background in distributed training of large language models
- Familiarity with PyTorch internals is preferred

We are an equal opportunity employer.`;

  it("lifts the lines that read like requirements", () => {
    const reqs = requirementsFromText(JD);
    expect(reqs.map((r) => r.text)).toEqual([
      "Experience with CUDA kernel programming and GPU profiling",
      "Strong background in distributed training of large language models",
      "Familiarity with PyTorch internals is preferred",
    ]);
  });

  it("marks what the posting only prefers", () => {
    const reqs = requirementsFromText(JD);
    expect(reqs.map((r) => r.kind)).toEqual(["must", "must", "nice"]);
  });

  it("pulls keywords a search can use", () => {
    const [first] = requirementsFromText(JD);
    expect(first.keywords).toContain("cuda");
    expect(first.keywords).not.toContain("experience");
  });

  /* the stems are prefixes: a closing word boundary threw both of these away */
  it("reads a requirement stated as familiarity or proficiency", () => {
    const reqs = requirementsFromText(
      `Role\n- Deep familiarity with distributed training across multi-node clusters\n- Proficiency in PyTorch internals and custom autograd\n- Experience with C++ in hot paths`
    );
    expect(reqs).toHaveLength(3);
  });

  it("leaves out the boilerplate every posting carries", () => {
    const reqs = requirementsFromText(
      `- Experience with CUDA kernels and GPU profiling\n- Strong background in distributed systems\n- Familiarity with Rust is preferred\nWe are an equal opportunity employer and value diversity.`
    );
    expect(reqs.map((r) => r.text)).not.toContain(
      "We are an equal opportunity employer and value diversity."
    );
  });

  /* copied from a site that collapses whitespace, or out of a PDF: one
     paragraph, no line breaks, and every piece over the length limit */
  it("reads a posting that arrived as a single paragraph", () => {
    const reqs = requirementsFromText(
      "Senior ML Systems Engineer. What you'll do: Strong experience writing CUDA kernels and " +
        "profiling GPU workloads. Deep familiarity with distributed training of large language " +
        "models across multi-node clusters. Ability to reduce inference latency for transformer " +
        "serving in production. Familiarity with Verilog or hardware accelerator design is preferred."
    );
    expect(reqs.length).toBeGreaterThanOrEqual(4);
    expect(reqs.some((r) => /CUDA/.test(r.text))).toBe(true);
    expect(reqs.some((r) => r.kind === "nice")).toBe(true);
  });

  it("gives nothing back for a posting with no prose in it", () => {
    expect(requirementsFromText("\n\n  \n")).toEqual([]);
  });
});

describe("corpusPrompt", () => {
  const docs: Doc[] = [
    { id: "b1", kind: "bullet", entryId: "e1", entryKind: "experience", text: "Wrote CUDA kernels", context: "Acme", tags: [] },
    { id: "b2", kind: "bullet", entryId: "e1", entryKind: "experience", text: "Built a React app", context: "Acme", tags: [] },
  ];

  it("offers every line it was given", () => {
    const p = corpusPrompt(docs);
    expect(p).toContain("b1\tWrote CUDA kernels");
    expect(p).toContain("b2\tBuilt a React app");
  });

  /* the fan-out is only affordable because this half is byte-identical across
     every judge in a run — that is what the provider's cache keys on */
  it("does not vary with the requirement being judged", () => {
    expect(corpusPrompt(docs)).toBe(corpusPrompt(docs));
    expect(corpusPrompt(docs)).not.toContain("Requirement");
  });

  it("says an empty answer is allowed, so a gap is reportable", () => {
    expect(corpusPrompt(docs)).toMatch(/empty list is the\s+right answer/);
  });

  /* the privacy boundary is structural — the prompt is built from this one
     argument — but a test says so out loud */
  it("carries the lines and not the entry they came from", () => {
    expect(corpusPrompt(docs)).not.toContain("Acme");
  });
});

describe("requirementPrompt", () => {
  it("carries one requirement and marks whether it is stated or preferred", () => {
    expect(requirementPrompt({ text: "CUDA kernels", kind: "must", keywords: ["cuda"] })).toContain(
      "stated requirement"
    );
    expect(requirementPrompt({ text: "React", kind: "nice", keywords: [] })).toContain("preferred");
  });

  it("holds no CV text, so it is the only part that changes per judge", () => {
    const p = requirementPrompt({ text: "CUDA kernels", kind: "must", keywords: ["cuda", "gpu"] });
    expect(p).toContain("cuda, gpu");
    expect(p).not.toContain("\t");
  });
});

describe("valueOf", () => {
  it("passes a single verdict through unchanged", () => {
    expect(valueOf([0.9])).toBeCloseTo(0.9, 6);
  });

  it("is worth more for a line that answers two requirements", () => {
    expect(valueOf([0.9, 0.6])).toBeGreaterThan(valueOf([0.9]));
  });

  /* the reason it is noisy-or and not a sum: breadth must not let weak
     matches outrank direct evidence */
  it("keeps three half-matches below one direct hit", () => {
    expect(valueOf([0.4, 0.4, 0.4])).toBeLessThan(valueOf([1]));
  });

  it("stays inside 0..1 however many verdicts there are", () => {
    const v = valueOf([0.9, 0.9, 0.9, 0.9, 0.9]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("is zero when nothing was evidence", () => {
    expect(valueOf([])).toBe(0);
  });
});

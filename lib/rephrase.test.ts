/**
 * The guard on the one part of this app that writes.
 *
 * Most of these are about `facts()` and `check()` rather than the model call,
 * because the model call is not where the safety lives. The last block is the
 * one that matters: it runs a model that invents things — enthusiastically, the
 * way a helpful one does — and asserts the rewrite never reaches the caller as
 * acceptable. Testing against a model that behaves would measure the model.
 */
import { describe, expect, it } from "vitest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { check, facts, propose } from "./rephrase";
import type { Requirement as Req } from "./agent";

const REQS: Req[] = [
  { text: "Experience optimising LLM inference latency", kind: "must", keywords: ["llm", "inference", "latency"] },
  { text: "Familiarity with GPU kernels", kind: "nice", keywords: ["gpu", "kernel"] },
];

describe("facts", () => {
  it("takes anything with a digit", () => {
    expect(facts("Cut decode latency 40% on a 7B model")).toEqual(
      expect.arrayContaining(["40%", "7b"])
    );
  });

  it("takes acronyms and inner capitals", () => {
    const f = facts("Wrote CUDA kernels in PyTorch");
    expect(f).toEqual(expect.arrayContaining(["cuda", "pytorch"]));
  });

  it("takes a name capitalised mid-sentence", () => {
    expect(facts("Built a testbench in Verilog")).toContain("verilog");
  });

  it("keeps punctuated terms whole", () => {
    const f = facts("Shipped a node.js service and raised f1-score");
    expect(f).toEqual(expect.arrayContaining(["node.js", "f1-score"]));
  });

  /* otherwise every line begins with a fact and nothing can ever be reworded */
  it("does not treat the opening verb as a fact", () => {
    expect(facts("Designed a scheduler")).not.toContain("designed");
  });

  it("ignores bold markers", () => {
    expect(facts("Cut latency **40%**")).toEqual(facts("Cut latency 40%"));
  });
});

describe("check", () => {
  const orig = "Reduced inference latency 40% on a 7B model using CUDA graphs";

  it("passes an honest reword", () => {
    const c = check(orig, "Cut inference latency by 40% on a 7B model with CUDA graphs");
    expect(c.ok).toBe(true);
    expect(c.invented).toEqual([]);
  });

  /* the posting's word for the thing, which is by definition not in your
     sentence yet — refused on its own, allowed once the entry vouches for it */
  it("refuses a term nothing licenses, and allows one the entry does", () => {
    const reword = "Cut LLM inference latency 40% on a 7B model with CUDA graphs";
    expect(check(orig, reword).ok).toBe(false);
    expect(check(orig, reword).invented).toContain("llm");

    const c = check(orig, reword, ["ML Systems Intern", "llm", "serving"]);
    expect(c.ok).toBe(true);
    expect(c.borrowed).toContain("llm");
  });

  it("lets a spelled-out form vouch for its acronym", () => {
    const c = check(orig, "Cut LLM inference latency 40% on a 7B model with CUDA graphs", [
      "large language model serving",
    ]);
    expect(c.ok).toBe(true);
  });

  /* the alias table is built for retrieval, where casting wide is cheap. Read
     loosely here it would license a tool you have never touched */
  it("does not let a partial alias vouch", () => {
    const c = check("Trained a classifier", "Trained a classifier in PyTorch", ["deep learning"]);
    expect(c.ok).toBe(false);
    expect(c.invented).toContain("pytorch");
  });

  /* the tier that context must never reach */
  it("never lets context license a number", () => {
    const c = check("Reduced inference latency", "Reduced inference latency 40%", ["40% faster", "llm"]);
    expect(c.ok).toBe(false);
    expect(c.invented).toContain("40%");
  });

  /* the posting is not context, and this is the reason the parameter exists */
  it("does not take the posting as a licence", () => {
    const c = check(orig, "Reduced inference latency 40% on a 7B model using TensorRT", []);
    expect(c.ok).toBe(false);
    expect(c.invented).toContain("tensorrt");
  });

  /* the case this whole file exists for */
  it("refuses an invented number", () => {
    const c = check("Reduced inference latency using CUDA graphs", "Reduced inference latency 40% using CUDA graphs");
    expect(c.ok).toBe(false);
    expect(c.reason).toBe("invented");
    expect(c.invented).toContain("40%");
  });

  it("refuses an invented tool", () => {
    const c = check(orig, "Reduced inference latency 40% on a 7B model using CUDA graphs and TensorRT");
    expect(c.ok).toBe(false);
    expect(c.invented).toContain("tensorrt");
  });

  it("refuses a number that grew", () => {
    const c = check(orig, "Reduced inference latency 60% on a 7B model using CUDA graphs");
    expect(c.ok).toBe(false);
    expect(c.invented).toContain("60%");
  });

  /* shortening a line so it fits is the point of the tab this runs in */
  it("allows dropping a fact, and says which", () => {
    const c = check(orig, "Cut inference latency 40% with CUDA graphs");
    expect(c.ok).toBe(true);
    expect(c.dropped).toContain("7b");
  });

  it("reports how much longer it got", () => {
    expect(check("short", "a much longer line").delta).toBeGreaterThan(0);
    expect(check("a much longer line", "short").delta).toBeLessThan(0);
  });

  it("refuses a no-op", () => {
    expect(check(orig, orig).reason).toBe("unchanged");
    expect(check(orig, `  ${orig.toUpperCase()}  `).ok).toBe(false);
  });

  it("refuses an empty rewrite", () => {
    expect(check(orig, "   ").reason).toBe("empty");
  });
});

/* ------------------------------------------------------------------ *
 * the model call
 * ------------------------------------------------------------------ */

interface Seen {
  system: string;
  user: string;
}

function fakeModel(reply: (user: string) => string) {
  const seen: Seen[] = [];
  const flat = (input: unknown, role: string) =>
    ((input as { role: string; content: unknown }[]) ?? [])
      .filter((m) => m.role === role)
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n");

  const run = (input: unknown) => {
    const user = flat(input, "user");
    seen.push({ system: flat(input, "system"), user });
    return { rewritten: reply(user) };
  };

  const model = {
    withStructuredOutput: () => ({
      invoke: async (input: unknown) => ({ parsed: run(input), raw: {} }),
    }),
    invoke: async (input: unknown) => ({ content: JSON.stringify(run(input)) }),
  } as unknown as BaseChatModel;

  return { model, seen };
}

const ask = (fake: ReturnType<typeof fakeModel>, text: string) =>
  propose({
    bulletId: "b1",
    text,
    requirements: REQS,
    reqs: [0],
    context: ["ML Systems Intern", "llm", "serving"],
    model: fake.model,
    kind: "openai",
  });

describe("propose", () => {
  const LINE = "Reduced inference latency 40% on a 7B model using CUDA graphs";

  it("returns a rewrite the guard accepts", async () => {
    const fake = fakeModel(() => "Cut LLM inference latency 40% on a 7B model with CUDA graphs");
    const { proposal } = await ask(fake, LINE);
    expect(proposal.check.ok).toBe(true);
    expect(proposal.rewritten).toMatch(/LLM inference latency/);
    expect(proposal.check.borrowed).toContain("llm");
  });

  /* the model that helps too much — the realistic failure, not the adversarial one */
  it("marks an embellished rewrite unusable", async () => {
    const fake = fakeModel(() => "Led a team of 5 to cut p99 LLM inference latency 60% with TensorRT and CUDA graphs");
    const { proposal } = await ask(fake, LINE);
    expect(proposal.check.ok).toBe(false);
    expect(proposal.check.reason).toBe("invented");
    expect(proposal.check.invented).toEqual(expect.arrayContaining(["tensorrt", "60%"]));
  });

  it("fences the posting text it was given", async () => {
    const fake = fakeModel(() => LINE.replace("Reduced", "Cut"));
    await ask(fake, LINE);
    expect(fake.seen[0].user).toMatch(/POSTING/);
  });

  /* a requirement is bounded before it reaches any prompt, here as elsewhere */
  it("bounds the requirement before sending it", async () => {
    const long = "x".repeat(500);
    const fake = fakeModel(() => LINE.replace("Reduced", "Cut"));
    await propose({
      bulletId: "b1",
      text: LINE,
      requirements: [{ text: long, kind: "must", keywords: [] }],
      reqs: [0],
      model: fake.model,
      kind: "openai",
    });
    expect(fake.seen[0].user).not.toContain(long);
  });

  it("states the rule to the model as well as enforcing it", async () => {
    const fake = fakeModel(() => LINE.replace("Reduced", "Cut"));
    await ask(fake, LINE);
    expect(fake.seen[0].system).toMatch(/Invent nothing/);
  });

  /* a rewrite that throws is a suggestion that does not appear, not a broken run */
  it("survives a model that fails", async () => {
    const model = {
      withStructuredOutput: () => ({ invoke: async () => { throw new Error("down"); } }),
      invoke: async () => { throw new Error("down"); },
    } as unknown as BaseChatModel;

    const { proposal } = await propose({
      bulletId: "b1", text: LINE, requirements: REQS, reqs: [0], model, kind: "openai",
    });
    expect(proposal.check.ok).toBe(false);
    expect(proposal.rewritten).toBe("");
  });
});

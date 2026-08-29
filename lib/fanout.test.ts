/**
 * The fan-out, exercised with a stand-in model.
 *
 * Everything here is about the graph rather than the prompts: that one judge
 * really is dispatched per requirement, that their results really do merge,
 * that they really are capped at the configured concurrency — and, the one that
 * the whole cost argument rests on, that every judge in a run really does send
 * a byte-identical prompt prefix. That last property is invisible in the code
 * (it holds only because `fanOut` hands every task the same shortlist) and it
 * is exactly the kind of thing a later refactor breaks without noticing.
 */
import { describe, expect, it } from "vitest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tailor } from "./agent";
import { BLANK } from "./llm";
import { SEED } from "./seed";

const JD = `Senior ML Systems Engineer
- Strong experience writing CUDA kernels and profiling GPU workloads
- Deep familiarity with distributed training of large language models
- Proficiency in PyTorch internals and custom autograd
- Ability to reduce inference latency for transformer serving
- Experience with C++ and Python in performance-critical code paths
- Familiarity with Verilog or hardware accelerator design is preferred`;

interface Call {
  system: string;
  user: string;
}

/**
 * The smallest thing `structured()` will talk to: `withStructuredOutput`, and
 * `invoke` for the free-text fallback. Subclassing `BaseChatModel` would test
 * LangChain rather than this file.
 */
function fakeModel(opts: { failOn?: number; delayMs?: number } = {}) {
  const calls: Call[] = [];
  let live = 0;
  let peak = 0;

  const answer = (system: string, user: string) => {
    /* the read step: no corpus, so no system message */
    if (!system) return { requirements: readRequirements() };
    const n = Number(user.match(/#(\d+)/)?.[1] ?? -1);
    if (opts.failOn !== undefined && n === opts.failOn) throw new Error(`judge ${n} refused`);
    /* two lines of evidence, drawn from the corpus it was actually handed */
    const ids = [...system.matchAll(/^(\S+)\t/gm)].map((m) => m[1]);
    return { evidence: ids.slice(0, 2).map((id) => ({ id, score: 0.8 })) };
  };

  const readRequirements = () =>
    JD.split("\n")
      .slice(1)
      .map((l, i) => ({
        text: `#${i} ${l.replace(/^- /, "")}`,
        kind: /preferred/.test(l) ? "nice" : "must",
        keywords: ["cuda", "pytorch", "verilog"],
      }));

  const run = async (input: unknown) => {
    const msgs = input as { role: string; content: string | { text: string }[] }[];
    const flat = (r: string) => {
      const m = msgs.find((x) => x.role === r);
      if (!m) return "";
      return typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join("\n");
    };
    const system = flat("system");
    const user = flat("user");
    live += 1;
    peak = Math.max(peak, live);
    try {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const value = answer(system, user);
      calls.push({ system, user });
      return value;
    } finally {
      live -= 1;
    }
  };

  const model = {
    withStructuredOutput: () => ({
      invoke: async (input: unknown) => ({
        parsed: await run(input),
        raw: {
          usage_metadata: {
            input_tokens: 1000,
            output_tokens: 40,
            input_token_details: { cache_read: 900, cache_creation: 100 },
          },
        },
      }),
    }),
    invoke: async (input: unknown) => ({ content: JSON.stringify(await run(input)) }),
  } as unknown as BaseChatModel;

  return { model, calls, peak: () => peak };
}

const run = (fake: ReturnType<typeof fakeModel>, over: Partial<Parameters<typeof tailor>[0]> = {}) =>
  tailor({
    db: SEED,
    base: SEED.variants[0],
    jd: JD,
    settings: { ...BLANK, enabled: true, model: "fake" },
    makeModel: async () => fake.model,
    ...over,
  });

const judgeCalls = (fake: ReturnType<typeof fakeModel>) => fake.calls.filter((c) => c.system);

describe("the judge fan-out", () => {
  it("dispatches one judge per requirement", async () => {
    const fake = fakeModel();
    const out = await run(fake);
    expect(out.requirements).toHaveLength(6);
    /* one read call with no corpus, then one judge per requirement */
    expect(judgeCalls(fake)).toHaveLength(6);
  });

  it("gives every judge the same prompt prefix, which is what the cache keys on", async () => {
    const fake = fakeModel();
    await run(fake);
    const prefixes = new Set(judgeCalls(fake).map((c) => c.system));
    expect(prefixes.size).toBe(1);
  });

  it("gives each judge a different question", async () => {
    const fake = fakeModel();
    await run(fake);
    const questions = new Set(judgeCalls(fake).map((c) => c.user));
    expect(questions.size).toBe(judgeCalls(fake).length);
  });

  it("merges what the parallel judges found", async () => {
    const fake = fakeModel();
    const out = await run(fake);
    /* every judge returned evidence, so every requirement is answerable */
    expect(out.gaps).toHaveLength(0);
    expect(out.judged.some((j) => j.reqs.length > 1)).toBe(true);
  });

  it("holds the fan-out to the concurrency it was given", async () => {
    const fake = fakeModel({ delayMs: 5 });
    await run(fake, { concurrency: 2 });
    expect(fake.peak()).toBeLessThanOrEqual(2);
  });

  it("really does run them in parallel", async () => {
    const fake = fakeModel({ delayMs: 5 });
    await run(fake, { concurrency: 4 });
    expect(fake.peak()).toBeGreaterThan(1);
  });

  it("adds up the token usage across every branch", async () => {
    const fake = fakeModel();
    const out = await run(fake);
    expect(out.usage.calls).toBe(7);
    expect(out.usage.cacheRead).toBe(6300);
    expect(out.usage.input).toBe(7000);
  });

  /**
   * The distinction worth keeping: a judge that returned nonsense is a local
   * problem, and a rejected key is not — degrading quietly through the second
   * hands back a keyword-matched résumé while the panel still claims a model
   * read it.
   */
  it("fails the whole run rather than degrade quietly on a rejected key", async () => {
    const fake = fakeModel();
    const bad = {
      withStructuredOutput: () => ({
        invoke: async () => {
          throw new Error("401 invalid_api_key: your key is not valid");
        },
      }),
      invoke: async () => {
        throw new Error("401 invalid_api_key: your key is not valid");
      },
    } as unknown as BaseChatModel;
    await expect(run(fake, { makeModel: async () => bad })).rejects.toThrow(/401/);
  });

  it("loses one requirement, not the run, when a single judge fails", async () => {
    const fake = fakeModel({ failOn: 2 });
    const out = await run(fake);
    expect(out.requirements).toHaveLength(6);
    /* the other five judges still answered, and the page was still packed */
    expect(out.result.chosen.length).toBeGreaterThan(0);
    expect(out.offline).toBe(false);
  });
});

/**
 * The split this file is about: the model proposes a project, and the arithmetic
 * saying what it is worth happens here, from hits already recorded.
 *
 * So most of these tests hand `ground` a model output that is optimistic in the
 * ways a model is optimistic — claiming every gap, claiming gaps that do not
 * exist, claiming ones the library already answers — and check the number that
 * comes out is the one the record supports rather than the one it asked for.
 */
import { describe, expect, it } from "vitest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { background, ground, payoff, suggest, worthBuilding, MAX_THEMES } from "./suggest";
import type { Theme, ThemeHit } from "./gaps";
import type { DB } from "./types";

const hit = (h: Partial<ThemeHit> & { appId: string }): ThemeHit => ({
  company: "Acme",
  role: "SWE",
  text: "something",
  kind: "must",
  answer: "none",
  ...h,
});

const theme = (t: Partial<Theme> & { id: string }): Theme => {
  const hits = t.hits ?? [];
  return {
    label: t.id,
    terms: [t.id],
    hits,
    asked: hits.length,
    onPage: hits.filter((h) => h.answer === "page").length,
    inLibrary: hits.filter((h) => h.answer === "library").length,
    missing: hits.filter((h) => h.answer === "none").length,
    missingMusts: hits.filter((h) => h.answer === "none" && h.kind === "must").length,
    ...t,
  };
};

describe("worthBuilding", () => {
  it("drops themes something already answers", () => {
    const answered = theme({ id: "t-ok", hits: [hit({ appId: "a1", answer: "page" })] });
    const open = theme({ id: "t-gap", hits: [hit({ appId: "a2" })] });
    expect(worthBuilding([answered, open]).map((t) => t.id)).toEqual(["t-gap"]);
  });

  /* two postings that insisted beats four that mentioned it in passing: the
     first is why you were filtered out, the second is a preference */
  it("puts what was required ahead of what was merely asked", () => {
    const insisted = theme({ id: "t-must", hits: [hit({ appId: "a1" }), hit({ appId: "a2" })] });
    const mentioned = theme({
      id: "t-nice",
      hits: ["a3", "a4", "a5", "a6"].map((appId) => hit({ appId, kind: "nice" })),
    });
    expect(worthBuilding([mentioned, insisted]).map((t) => t.id)).toEqual(["t-must", "t-nice"]);
  });

  it("stops before the tail of one-off phrasings", () => {
    const many = Array.from({ length: MAX_THEMES + 6 }, (_, i) =>
      theme({ id: `t${i}`, hits: [hit({ appId: `a${i}` })] })
    );
    expect(worthBuilding(many)).toHaveLength(MAX_THEMES);
  });
});

describe("payoff", () => {
  /* the unit is an application that would have gone better, not a requirement */
  it("counts a posting once however many gaps it asked about", () => {
    const a = theme({ id: "t1", hits: [hit({ appId: "same" })] });
    const b = theme({ id: "t2", hits: [hit({ appId: "same" })] });
    expect(payoff([a, b]).postings).toBe(1);
    expect(payoff([a, b]).musts).toBe(2);
  });

  it("ignores asks something already answered", () => {
    const t = theme({
      id: "t1",
      hits: [hit({ appId: "a1", answer: "page" }), hit({ appId: "a2", answer: "library" }), hit({ appId: "a3" })],
    });
    expect(payoff([t]).postings).toBe(1);
    expect(payoff([t]).musts).toBe(1);
    expect(payoff([t]).helps.map((a) => a.appId)).toEqual(["a3"]);
  });

  it("separates required from preferred", () => {
    const t = theme({ id: "t1", hits: [hit({ appId: "a1" }), hit({ appId: "a2", kind: "nice" })] });
    expect(payoff([t]).postings).toBe(2);
    expect(payoff([t]).musts).toBe(1);
  });
});

describe("ground", () => {
  const themes = [
    theme({ id: "t-cuda", hits: [hit({ appId: "a1" }), hit({ appId: "a2" })] }),
    theme({ id: "t-api", hits: [hit({ appId: "a3", kind: "nice" })] }),
  ];
  const idea = (themeIds: string[], title = "A project") => ({ title, what: "w", why: "y", themeIds });

  it("works the payoff out from the record, not from the claim", () => {
    const [s] = ground([idea(["t-cuda"])], themes);
    expect(s.postings).toBe(2);
    expect(s.musts).toBe(2);
  });

  /* a count nobody can trace is a count nobody trusts */
  it("names the applications behind the number", () => {
    const [s] = ground([idea(["t-cuda"])], themes);
    expect(s.helps.map((a) => a.appId)).toEqual(["a1", "a2"]);
  });

  /* a project justified by a requirement nobody asked for is fiction */
  it("drops an idea whose gaps do not exist", () => {
    expect(ground([idea(["t-invented"])], themes)).toEqual([]);
  });

  it("keeps the real half of a partly invented claim", () => {
    const [s] = ground([idea(["t-cuda", "t-invented"])], themes);
    expect(s.themes.map((t) => t.id)).toEqual(["t-cuda"]);
    expect(s.postings).toBe(2);
  });

  it("does not double-count a repeated id", () => {
    const [s] = ground([idea(["t-cuda", "t-cuda"])], themes);
    expect(s.musts).toBe(2);
  });

  it("ranks by what was required, then by reach", () => {
    const out = ground([idea(["t-api"], "small"), idea(["t-cuda"], "big")], themes);
    expect(out.map((s) => s.title)).toEqual(["big", "small"]);
  });
});

describe("background", () => {
  const db = {
    entries: [
      { id: "e1", kind: "experience", org: "Acme", title: "ML Intern", location: "", period: "",
        bullets: [{ id: "b1", text: "a sentence nobody should send", tags: [] }], tags: ["ml"] },
      { id: "e2", kind: "education", org: "Uni", title: "BSc", location: "", period: "", bullets: [], tags: [] },
    ],
    skills: [{ id: "s1", label: "Languages", items: "C++, Python", tags: [] }],
  } as unknown as DB;

  it("says what they have worked on and what they know", () => {
    const b = background(db);
    expect(b).toContain("Acme — ML Intern");
    expect(b).toContain("C++, Python");
    expect(b).toContain("ml");
  });

  /* titles and tags, never the bullets — the job is to suggest something
     adjacent, and it does not need the sentences to do that */
  it("does not send the bullets", () => {
    expect(background(db)).not.toContain("nobody should send");
  });

  it("leaves education out of the worked-on list", () => {
    expect(background(db)).not.toContain("BSc");
  });
});

describe("suggest", () => {
  const themes = [theme({ id: "t-cuda", label: "CUDA kernel work", hits: [hit({ appId: "a1" })] })];
  const db = { entries: [], skills: [] } as unknown as DB;

  function fake(reply: unknown, capture: { user: string[] } = { user: [] }) {
    const run = (input: unknown) => {
      const msgs = (input as { role: string; content: unknown }[]) ?? [];
      capture.user.push(
        msgs.filter((m) => m.role === "user").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n")
      );
      return reply;
    };
    return {
      capture,
      model: {
        withStructuredOutput: () => ({ invoke: async (i: unknown) => ({ parsed: run(i), raw: {} }) }),
        invoke: async (i: unknown) => ({ content: JSON.stringify(run(i)) }),
      } as unknown as BaseChatModel,
    };
  }

  it("returns grounded suggestions", async () => {
    const f = fake({ ideas: [{ title: "A kernel", what: "w", why: "y", themeIds: ["t-cuda"] }] });
    const { suggestions } = await suggest({ themes, db, model: f.model, kind: "openai" });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].postings).toBe(1);
  });

  it("fences the gap labels it was given", async () => {
    const f = fake({ ideas: [] });
    await suggest({ themes, db, model: f.model, kind: "openai" });
    expect(f.capture.user[0]).toMatch(/GAPS/);
  });

  it("asks nothing when there is nothing to build for", async () => {
    const f = fake({ ideas: [{ title: "x", what: "w", why: "y", themeIds: ["t"] }] });
    const answered = [theme({ id: "t", hits: [hit({ appId: "a1", answer: "page" })] })];
    const { suggestions } = await suggest({ themes: answered, db, model: f.model, kind: "openai" });
    expect(suggestions).toEqual([]);
    expect(f.capture.user).toEqual([]);
  });

  /* the gap list is already on screen and is the output that matters */
  it("survives a model that fails", async () => {
    const model = {
      withStructuredOutput: () => ({ invoke: async () => { throw new Error("down"); } }),
      invoke: async () => { throw new Error("down"); },
    } as unknown as BaseChatModel;
    const { suggestions } = await suggest({ themes, db, model, kind: "openai" });
    expect(suggestions).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { STRONG, buildIndex, corpus, expand, retrieve, search, tokenize } from "./retrieve";
import type { Bullet, DB, Entry } from "./types";

const bullet = (id: string, text: string, tags: string[] = []): Bullet => ({ id, text, tags });

const entry = (e: Partial<Entry> & { id: string }): Entry => ({
  kind: "experience",
  org: "",
  title: "",
  location: "",
  period: "",
  bullets: [],
  tags: [],
  ...e,
});

function fixture(): DB {
  return {
    version: 2,
    tags: ["ml", "hw"],
    profile: {
      name: "Jane Doe",
      headline: "",
      email: "jane@example.com",
      phone: "",
      linkedin: "",
      github: "",
      site: "",
      location: "",
    },
    entries: [
      entry({
        id: "e-ml",
        org: "Acme Research",
        title: "ML Intern",
        tags: ["ml"],
        bullets: [
          bullet("b-cuda", "Wrote CUDA kernels that cut decode latency on a 7B model by 40%"),
          bullet("b-train", "Trained a transformer in PyTorch on eight GPUs"),
        ],
      }),
      entry({
        id: "e-web",
        org: "Bell Studio",
        title: "Frontend Engineer",
        bullets: [
          bullet("b-react", "Built the checkout flow in React and TypeScript"),
          bullet("b-css", "Rewrote the design system with Node.js tooling and C++ addons"),
        ],
      }),
    ],
    skills: [{ id: "s-lang", label: "Languages", items: "C++, Python, TypeScript", tags: ["ml"] }],
    variants: [],
    applications: [],
    platforms: [],
    problems: [],
  };
}

describe("tokenize", () => {
  it("keeps the punctuation that is part of a name", () => {
    expect(tokenize("C++, Node.js and f1-score")).toEqual(["c++", "node.js", "f1-score"]);
  });

  it("drops filler that appears in every posting", () => {
    expect(tokenize("You will have experience with the team")).toEqual([]);
  });

  it("reads through bold markup", () => {
    expect(tokenize("cut **latency** hard")).toEqual(["cut", "latency", "hard"]);
  });
});

describe("expand", () => {
  it("folds an abbreviation into the words it stands for", () => {
    expect(expand("LLM inference")).toContain("language");
  });

  it("leaves a term that needs no expansion alone", () => {
    expect(expand("verilog")).toEqual(["verilog"]);
  });
});

describe("corpus", () => {
  it("makes one document per bullet plus one per skill group", () => {
    expect(corpus(fixture())).toHaveLength(5);
  });

  it("lets a bullet inherit its entry's tags", () => {
    const doc = corpus(fixture()).find((d) => d.id === "b-cuda");
    expect(doc?.tags).toContain("ml");
  });

  it("carries the entry heading as context, not as a claim", () => {
    const doc = corpus(fixture()).find((d) => d.id === "b-react");
    expect(doc?.context).toBe("Bell Studio Frontend Engineer");
  });
});

describe("search", () => {
  const index = buildIndex(corpus(fixture()));

  it("finds the bullet that says the words", () => {
    expect(search(index, "CUDA kernels")[0].doc.id).toBe("b-cuda");
  });

  it("crosses the vocabulary gap the alias table covers", () => {
    const ids = search(index, "deep learning frameworks").map((h) => h.doc.id);
    expect(ids).toContain("b-train");
  });

  it("returns nothing rather than noise for an unrelated query", () => {
    expect(search(index, "phlebotomy")).toEqual([]);
  });

  it("reports which query terms a hit actually matched", () => {
    expect(search(index, "react checkout")[0].matched.sort()).toEqual(["checkout", "react"]);
  });

  it("lifts a document the asked-for tag was hand-applied to", () => {
    const plain = search(index, "python");
    const tagged = search(index, "python", { tags: ["ml"] });
    const scoreOf = (hits: typeof plain, id: string) => hits.find((h) => h.doc.id === id)?.score ?? 0;
    expect(scoreOf(tagged, "s-lang")).toBeGreaterThan(scoreOf(plain, "s-lang"));
  });
});

describe("retrieve", () => {
  const index = buildIndex(corpus(fixture()));

  it("ranks a bullet that answers two requirements above one that answers a single one", () => {
    const hits = retrieve(index, ["CUDA kernel work", "latency optimisation", "React frontend"]);
    expect(hits[0].doc.id).toBe("b-cuda");
    expect(hits[0].forReqs.length).toBeGreaterThan(1);
  });

  it("keeps each document once, remembering every requirement it answered", () => {
    const hits = retrieve(index, ["CUDA", "CUDA"]);
    const cuda = hits.filter((h) => h.doc.id === "b-cuda");
    expect(cuda).toHaveLength(1);
    expect(cuda[0].forReqs).toEqual([0, 1]);
  });

  it("gives full cover to a line that answers every term asked for", () => {
    const [top] = retrieve(index, ["CUDA kernels"]);
    expect(top.perReq[0]).toBe(1);
  });

  it("keeps a shortlisted-but-unrelated line below the evidence threshold", () => {
    const hits = retrieve(index, ["CUDA kernels and GPU work"]);
    const weak = hits.find((h) => h.doc.id === "b-react");
    /* React is on the shortlist only because something had to be — it must not
       read as evidence for a CUDA requirement */
    if (weak) expect(weak.perReq[0]).toBeLessThan(STRONG);
  });

  /**
   * The failure this replaced: terms missing from the corpus were dropped from
   * the denominator, so a requirement written entirely in vocabulary the
   * library never uses was scored against whatever incidental word was left —
   * and any line sharing it covered "everything asked for".
   */
  it("scores a requirement the library has no vocabulary for near zero", () => {
    const hits = retrieve(index, ["phlebotomy cannulation wound dressing react"]);
    for (const h of hits) expect(h.perReq[0]).toBeLessThan(STRONG);
  });

  it("keeps the clusters of a split posting apart instead of blending them", () => {
    const ids = retrieve(index, ["CUDA kernels", "React and TypeScript"]).map((h) => h.doc.id);
    expect(ids).toContain("b-cuda");
    expect(ids).toContain("b-react");
  });
});

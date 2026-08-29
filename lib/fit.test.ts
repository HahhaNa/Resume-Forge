import { describe, expect, it } from "vitest";
import { estimate, estimatePages, lineCount, metrics, textWidth } from "./fit";
import { resolve } from "./resume";
import type { Bullet, DB, Entry, Variant } from "./types";

const bullet = (id: string, text: string): Bullet => ({ id, text, tags: [] });

const variant = (v: Partial<Variant> = {}): Variant => ({
  id: "v1",
  name: "hw",
  label: "Hardware",
  note: "",
  sections: [
    { id: "sec-exp", title: "Experience", type: "entries", ids: ["e-job"] },
  ],
  bulletIds: ["b1"],
  header: { phone: true, linkedin: true, github: true, site: true },
  density: "normal",
  fontSize: 10,
  pageTarget: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...v,
});

const LONG =
  "Rebuilt the training pipeline so a run that previously took nine hours finished in under two, " +
  "by sharding the dataset across eight workers and moving augmentation onto the GPU";

function fixture(bullets: Bullet[] = [bullet("b1", "Cut latency by 40%")]): DB {
  const job: Entry = {
    id: "e-job",
    kind: "experience",
    org: "Acme R&D",
    title: "Research Intern",
    location: "Portland, OR",
    period: "Jan 2026 -- Jun 2026",
    bullets,
    tags: [],
  };
  return {
    version: 2,
    tags: [],
    profile: {
      name: "Jane Doe",
      headline: "",
      email: "jane@example.com",
      phone: "(555) 010-0100",
      linkedin: "linkedin.com/in/jane-doe",
      github: "",
      site: "",
      location: "Portland, OR",
    },
    entries: [job],
    skills: [],
    variants: [],
    applications: [],
    platforms: [],
    problems: [],
  };
}

const heightOf = (db: DB, v: Variant) => estimate(resolve(db, v), v);

describe("textWidth", () => {
  it("ignores the bold delimiters, which are markup rather than ink", () => {
    expect(textWidth("**latency**", 13)).toBeCloseTo(textWidth("latency", 13), 6);
  });

  it("charges a wide glyph more than a narrow one", () => {
    expect(textWidth("mmmm", 13)).toBeGreaterThan(textWidth("iiii", 13));
  });
});

describe("lineCount", () => {
  it("gives an empty string one line rather than none", () => {
    expect(lineCount("", 400, 13)).toBe(1);
  });

  it("wraps text that overruns the column", () => {
    expect(lineCount(LONG, 400, 13)).toBeGreaterThan(1);
  });

  it("keeps a short line on one row", () => {
    expect(lineCount("Cut latency by 40%", 400, 13)).toBe(1);
  });
});

describe("estimate", () => {
  it("grows when a bullet is added", () => {
    const db = fixture([bullet("b1", "Cut latency by 40%"), bullet("b2", "Wrote the parser")]);
    const one = heightOf(db, variant({ bulletIds: ["b1"] }));
    const two = heightOf(db, variant({ bulletIds: ["b1", "b2"] }));
    expect(two).toBeGreaterThan(one);
  });

  it("charges a wrapping bullet more than a short one", () => {
    const db = fixture([bullet("b1", "Cut latency by 40%"), bullet("b2", LONG)]);
    const short = heightOf(db, variant({ bulletIds: ["b1"] }));
    const long = heightOf(db, variant({ bulletIds: ["b2"] }));
    expect(long).toBeGreaterThan(short);
  });

  it("is shorter at tight density than at airy", () => {
    const db = fixture();
    const tight = heightOf(db, variant({ density: "tight" }));
    const airy = heightOf(db, variant({ density: "airy" }));
    expect(tight).toBeLessThan(airy);
  });

  it("is shorter at 10pt than at 11pt", () => {
    const db = fixture();
    expect(heightOf(db, variant({ fontSize: 10 }))).toBeLessThan(
      heightOf(db, variant({ fontSize: 11 }))
    );
  });

  /* the margins move with the density, so a tight page holds more than an airy one
     even before anything is set on it */
  it("gives a tight page more room than an airy one", () => {
    expect(metrics(variant({ density: "tight" })).pageH).toBeGreaterThan(
      metrics(variant({ density: "airy" })).pageH
    );
  });
});

describe("estimatePages", () => {
  it("calls a two-line résumé a small fraction of a page", () => {
    const db = fixture();
    const p = estimatePages(resolve(db, variant()), variant());
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.3);
  });

  it("calls forty wrapping bullets more than one page", () => {
    const many = Array.from({ length: 40 }, (_, i) => bullet(`b${i}`, `${i} ${LONG}`));
    const db = fixture(many);
    const v = variant({ bulletIds: many.map((b) => b.id) });
    expect(estimatePages(resolve(db, v), v)).toBeGreaterThan(1);
  });
});

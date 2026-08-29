import { describe, expect, it } from "vitest";
import { estimatePages } from "./fit";
import { pack } from "./pack";
import type { PackItem } from "./pack";
import { resolve } from "./resume";
import type { Bullet, DB, Entry, Variant } from "./types";

const bullet = (id: string, text: string): Bullet => ({ id, text, tags: [] });

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

/** Long enough to wrap, so a page holds fewer of them than the fixture supplies. */
const LINE =
  "Rebuilt the ingestion path so a nightly job that took nine hours finished in under two, " +
  "sharding the dataset across eight workers and moving every augmentation step onto the GPU";

const base: Variant = {
  id: "v1",
  name: "hw",
  label: "Hardware",
  note: "",
  sections: [
    { id: "sec-edu", title: "Education", type: "entries", ids: ["e-school"] },
    { id: "sec-exp", title: "Experience", type: "entries", ids: ["e-a", "e-b"] },
  ],
  bulletIds: [],
  header: { phone: true, linkedin: true, github: true, site: true },
  density: "normal",
  fontSize: 10,
  pageTarget: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Two jobs and a project of twelve bullets each, one degree, two skill groups. */
function fixture(): DB {
  const many = (p: string) => Array.from({ length: 12 }, (_, i) => bullet(`${p}${i}`, `${p}${i} ${LINE}`));
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
    entries: [
      entry({
        id: "e-school",
        kind: "education",
        org: "Northgate Institute",
        title: "M.S. Computer Science",
        period: "Sep 2026 -- Jun 2028",
      }),
      entry({ id: "e-a", org: "Acme R&D", title: "Research Intern", bullets: many("a") }),
      entry({ id: "e-b", org: "Bell Studio", title: "Engineer", bullets: many("b") }),
      entry({ id: "e-p", kind: "project", org: "Forge", title: "TypeScript", bullets: many("p") }),
    ],
    skills: [
      { id: "s-lang", label: "Languages", items: "C++, Python, TypeScript", tags: [] },
      { id: "s-tool", label: "Tools", items: "Git, Docker, CUDA", tags: [] },
    ],
    variants: [base],
    applications: [],
    platforms: [],
    problems: [],
  };
}

/** Every bullet and skill in the fixture, scored by a function of its id. */
function items(db: DB, score: (id: string) => number): PackItem[] {
  const out: PackItem[] = [];
  for (const e of db.entries) {
    for (const b of e.bullets) out.push({ id: b.id, kind: "bullet", entryId: e.id, score: score(b.id) });
  }
  for (const s of db.skills) out.push({ id: s.id, kind: "skill", entryId: "", score: score(s.id) });
  return out;
}

const asVariant = (r: ReturnType<typeof pack>): Variant => ({
  ...base,
  sections: r.sections,
  bulletIds: r.bulletIds,
});

describe("pack", () => {
  const db = fixture();

  it("fills one page without spilling onto a second", () => {
    const r = pack(db, base, items(db, () => 0.5));
    expect(r.fill).toBeLessThanOrEqual(1);
    expect(r.fill).toBeGreaterThan(0.8);
  });

  it("agrees with the whole-document estimate it is packing against", () => {
    const r = pack(db, base, items(db, () => 0.5));
    const v = asVariant(r);
    expect(estimatePages(resolve(db, v), v)).toBeCloseTo(r.fill, 6);
  });

  it("leaves out what it could not fit rather than silently dropping it", () => {
    const all = items(db, () => 0.5);
    const r = pack(db, base, all);
    expect(r.chosen.length + r.dropped.length).toBe(all.length);
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it("prefers the bullets the model scored highest", () => {
    const r = pack(db, base, items(db, (id) => (id.startsWith("a") ? 1 : 0.05)));
    const kept = new Set(r.chosen);
    const aKept = ["a0", "a1", "a2", "a3", "a4"].filter((x) => kept.has(x)).length;
    expect(aKept).toBe(5);
  });

  it("scores nothing onto the page when nothing scores", () => {
    const r = pack(db, base, items(db, () => 0));
    expect(r.chosen).toEqual([]);
    expect(r.bulletIds).toEqual([]);
  });

  it("keeps a pinned degree even though it has no bullets to earn its line", () => {
    const r = pack(db, base, items(db, () => 0.5), { pinnedEntryIds: ["e-school"] });
    const edu = r.sections.find((s) => s.title === "Education");
    expect(edu?.ids).toEqual(["e-school"]);
  });

  it("files a project under Projects rather than the first section going", () => {
    const r = pack(db, base, items(db, (id) => (id.startsWith("p") ? 1 : 0)));
    expect(r.sections.find((s) => s.ids.includes("e-p"))?.title).toBe("Projects");
  });

  it("keeps bullets in the order they were written, not the order they were scored", () => {
    const r = pack(db, base, items(db, (id) => (id === "a3" ? 1 : id === "a1" ? 0.9 : 0)));
    expect(r.bulletIds).toEqual(["a1", "a3"]);
  });

  it("drops an entries section that ended up with nothing in it", () => {
    const r = pack(db, base, items(db, (id) => (id.startsWith("a") ? 1 : 0)));
    expect(r.sections.map((s) => s.title)).not.toContain("Education");
  });

  it("fits more onto a tight 10pt page than an airy 11pt one", () => {
    const all = items(db, () => 0.5);
    const tight = pack(db, { ...base, density: "tight", fontSize: 10 }, all);
    const airy = pack(db, { ...base, density: "airy", fontSize: 11 }, all);
    expect(tight.chosen.length).toBeGreaterThan(airy.chosen.length);
  });

  it("honours a two-page target when the variant asks for one", () => {
    const all = items(db, () => 0.5);
    const one = pack(db, base, all, { pages: 1 });
    const two = pack(db, base, all, { pages: 2 });
    expect(two.chosen.length).toBeGreaterThan(one.chosen.length);
    expect(two.fill).toBeLessThanOrEqual(2);
  });
});

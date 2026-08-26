import { describe, expect, it } from "vitest";
import {
  addEntryToVariant,
  defaultBulletIds,
  isInVariant,
  needsBullets,
  pickSection,
  removeFromVariant,
} from "./library";
import type { Bullet, DB, Entry, Variant, VariantSection } from "./types";

const bullet = (id: string, tags: string[] = []): Bullet => ({ id, text: id, tags });

const entry = (e: Partial<Entry> & { id: string }): Entry => ({
  kind: "experience",
  org: e.id,
  title: "",
  location: "",
  period: "",
  bullets: [],
  tags: [],
  ...e,
});

const section = (id: string, title: string, ids: string[]): VariantSection => ({
  id,
  title,
  type: "entries",
  ids,
});

const variant = (v: Partial<Variant> & { id: string; name: string }): Variant => ({
  label: v.name,
  note: "",
  sections: [],
  bulletIds: [],
  header: { phone: true, linkedin: true, github: true, site: true },
  density: "normal",
  fontSize: 11,
  pageTarget: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...v,
});

function fixture() {
  const entries = [
    entry({ id: "e-job", kind: "experience", bullets: [bullet("b1", ["hw"]), bullet("b2")] }),
    entry({ id: "e-other-job", kind: "experience" }),
    entry({ id: "e-proj", kind: "project" }),
    entry({ id: "e-school", kind: "education" }),
  ];
  const source = variant({
    id: "v-source",
    name: "ml",
    sections: [
      section("s-exp", "Experience", ["e-other-job", "e-job"]),
      section("s-proj", "Selected Projects", ["e-proj"]),
    ],
  });
  const target = variant({
    id: "v-target",
    name: "hw",
    sections: [
      section("t-exp", "Experience", ["e-other-job"]),
      section("t-proj", "Selected Projects", []),
    ],
  });
  const db = {
    version: 2,
    tags: ["hw", "ml"],
    profile: {} as DB["profile"],
    entries,
    skills: [],
    variants: [source, target],
    applications: [],
    platforms: [],
    problems: [],
  } as DB;
  return { db, source, target, entries };
}

describe("needsBullets", () => {
  it("lets a degree or an award stand on its own", () => {
    expect(needsBullets("education")).toBe(false);
    expect(needsBullets("award")).toBe(false);
    expect(needsBullets("experience")).toBe(true);
    expect(needsBullets("project")).toBe(true);
  });
});

describe("pickSection", () => {
  it("prefers the section title that carries the entry in another variant", () => {
    const { db, target, entries } = fixture();
    expect(pickSection(db, target, entries[0])?.id).toBe("t-exp");
  });

  it("otherwise files it with its own kind", () => {
    const { db, target, entries } = fixture();
    // e-proj is a project and no other variant places it here yet
    db.variants = [target];
    target.sections[1].ids = ["e-proj-sibling"];
    db.entries.push(entry({ id: "e-proj-sibling", kind: "project" }));
    expect(pickSection(db, target, entries[2])?.id).toBe("t-proj");
  });

  it("uses the only entries section when there is just one", () => {
    const { db, target, entries } = fixture();
    target.sections = [section("only", "Anything", [])];
    db.variants = [target];
    expect(pickSection(db, target, entries[3])?.id).toBe("only");
  });

  it("returns null when a variant has no entries section at all", () => {
    const { db, target, entries } = fixture();
    target.sections = [];
    expect(pickSection(db, target, entries[0])).toBeNull();
  });
});

describe("defaultBulletIds", () => {
  it("switches on the bullets tagged for this variant", () => {
    const { target, entries } = fixture();
    expect(defaultBulletIds(target, entries[0])).toEqual(["b1"]);
  });

  it("falls back to every bullet when none carries the variant's tag", () => {
    const { entries } = fixture();
    const v = variant({ id: "v-x", name: "sw" });
    expect(defaultBulletIds(v, entries[0])).toEqual(["b1", "b2"]);
  });
});

describe("addEntryToVariant", () => {
  it("files the entry and ticks its default bullets", () => {
    const { db, target, entries } = fixture();
    const out = addEntryToVariant(db, target, entries[0]);
    expect(isInVariant(out, "e-job")).toBe(true);
    expect(out.bulletIds).toEqual(["b1"]);
  });

  it("keeps the order the entry has in the variant that already lists it", () => {
    const { db, target, entries } = fixture();
    // in v-source, e-job sits after e-other-job — so it should land after it here too
    const out = addEntryToVariant(db, target, entries[0]);
    expect(out.sections.find((s) => s.id === "t-exp")!.ids).toEqual(["e-other-job", "e-job"]);
  });

  it("never overwrites a tick pattern the user already chose", () => {
    const { db, target, entries } = fixture();
    target.bulletIds = ["b2"];
    expect(addEntryToVariant(db, target, entries[0]).bulletIds).toEqual(["b2"]);
  });

  it("makes a section when nothing suitable exists", () => {
    const { db, target, entries } = fixture();
    target.sections = [];
    db.variants = [target];
    const out = addEntryToVariant(db, target, entries[3]);
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].title).toBe("Education");
    expect(out.sections[0].ids).toEqual(["e-school"]);
  });

  it("does not file the same entry twice", () => {
    const { db, target, entries } = fixture();
    const once = addEntryToVariant(db, target, entries[1]);
    const twice = addEntryToVariant(db, once, entries[1]);
    expect(twice.sections.flatMap((s) => s.ids).filter((i) => i === "e-other-job")).toHaveLength(1);
  });
});

describe("removeFromVariant", () => {
  it("unfiles the entry but keeps its ticks, so putting it back restores the selection", () => {
    const { db, target, entries } = fixture();
    const added = addEntryToVariant(db, target, entries[0]);
    const removed = removeFromVariant(added, "e-job");
    expect(isInVariant(removed, "e-job")).toBe(false);
    expect(removed.bulletIds).toEqual(["b1"]);
    expect(isInVariant(addEntryToVariant(db, removed, entries[0]), "e-job")).toBe(true);
  });
});

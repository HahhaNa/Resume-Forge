import { describe, expect, it } from "vitest";
import { looksUntouched, migratePersisted } from "./migrate";
import { SEED } from "./seed";
import type { DB } from "./types";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A v1 database: no `tags` vocabulary, tags only on the records themselves. */
function v1(): DB {
  const db = clone(SEED) as Partial<DB>;
  delete db.tags;
  return db as DB;
}

describe("migratePersisted v1 -> v2", () => {
  it("recovers the tag vocabulary from the user's own records", () => {
    expect(new Set(migratePersisted({ db: v1() }, 1).db!.tags)).toEqual(new Set(["hw", "ml", "sw"]));
  });

  it("cannot recover a label nothing was tagged with, and that is not a loss", () => {
    // v1 had no vocabulary field, so an unused label had nowhere to be stored in the
    // first place. `tw` is in SEED.tags but on no entry, bullet, skill or variant.
    expect(migratePersisted({ db: v1() }, 1).db!.tags).not.toContain("tw");
  });

  it("keeps a tag that exists only on a bullet", () => {
    const db = v1();
    db.entries[0].tags = [];
    db.entries[0].bullets[0].tags = ["obscure"];
    expect(migratePersisted({ db }, 1).db!.tags).toContain("obscure");
  });

  it("keeps a tag that exists only as a variant name", () => {
    const db = v1();
    db.variants[0].name = "quant";
    expect(migratePersisted({ db }, 1).db!.tags).toContain("quant");
  });

  it("falls back to the seed vocabulary when nothing is tagged at all", () => {
    const db = v1();
    db.variants.forEach((v) => (v.name = ""));
    db.entries.forEach((e) => {
      e.tags = [];
      e.bullets.forEach((b) => (b.tags = []));
    });
    db.skills.forEach((k) => (k.tags = []));
    expect(migratePersisted({ db }, 1).db!.tags).toEqual([...SEED.tags]);
  });

  it("gives v1 the restore-point list it never had", () => {
    expect(migratePersisted({ db: v1() }, 1).restorePoints).toEqual([]);
  });

  it("loses no entries, bullets or applications on the way", () => {
    const before = v1();
    const after = migratePersisted({ db: clone(before) }, 1).db!;
    expect(after.entries).toHaveLength(before.entries.length);
    expect(after.entries.flatMap((e) => e.bullets)).toHaveLength(
      before.entries.flatMap((e) => e.bullets).length
    );
    expect(after.variants).toHaveLength(before.variants.length);
    expect(after.skills).toHaveLength(before.skills.length);
  });
});

describe("migratePersisted, everything else", () => {
  it("leaves a vocabulary the user already has alone", () => {
    const db = clone(SEED) as DB;
    db.tags = ["mine", "yours"];
    expect(migratePersisted({ db }, 1).db!.tags).toEqual(["mine", "yours"]);
  });

  it("does not touch state that is already current", () => {
    const db = clone(SEED) as DB;
    const points = [{ id: "rp1", at: "2026-01-01T00:00:00.000Z", label: "x", db }];
    expect(migratePersisted({ db, restorePoints: points }, 2)).toEqual({ db, restorePoints: points });
  });

  it("survives junk instead of throwing on launch", () => {
    // whatever comes out of storage, the app has to finish starting
    expect(() => migratePersisted(null, 1)).not.toThrow();
    expect(() => migratePersisted({}, 1)).not.toThrow();
    expect(() => migratePersisted({ db: { entries: [] } }, 1)).not.toThrow();
  });
});

describe("looksUntouched", () => {
  it("recognises the untouched demo", () => {
    expect(looksUntouched(SEED)).toBe(true);
  });

  it("counts a new entry as somebody's own work", () => {
    const db = clone(SEED) as DB;
    db.entries.push({ ...db.entries[0], id: "new" });
    expect(looksUntouched(db)).toBe(false);
  });

  it("counts a renamed profile as somebody's own work", () => {
    const db = clone(SEED) as DB;
    db.profile.name = "Hanna";
    expect(looksUntouched(db)).toBe(false);
  });

  it("counts a single tracked application as somebody's own work", () => {
    const db = clone(SEED) as DB;
    db.applications.push({ id: "a1", company: "Acme" } as DB["applications"][number]);
    expect(looksUntouched(db)).toBe(false);
  });
});

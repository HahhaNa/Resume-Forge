/* ------------------------------------------------------------------ *
 * What happens to somebody's saved data when the shape of it changes.
 *
 * This lives apart from the store on purpose. Everything else in `store.ts`
 * acts on state that is already in memory and already correct; these two run
 * against whatever a browser has been carrying since an older release, which
 * is the one input nobody can go back and fix. A migration that drops a field
 * takes an evening of someone's work with it, silently, on launch.
 *
 * So it is kept pure and it is kept tested. Every future schema bump adds a
 * branch here and cases to `migrate.test.ts` — the test first.
 * ------------------------------------------------------------------ */

import { SEED } from "./seed";
import type { DB, RestorePoint } from "./types";

/** Bump on any change to the persisted shape, and add a branch to `migratePersisted`. */
export const SCHEMA_VERSION = 3;

/** The part of the persisted state a migration is allowed to care about. */
export interface Persisted {
  db?: DB;
  restorePoints?: RestorePoint[];
}

/**
 * An older persisted state, brought up to `SCHEMA_VERSION`.
 *
 * v1 had no tag vocabulary and no restore points. The vocabulary is recovered from
 * the data rather than reset to the seed's, because the tags a user invented are
 * spread across their own entries and variants — the seed's four would be a
 * stranger's.
 *
 * v2 kept a link to the posting but never the posting. Nothing can recover that
 * for the applications already filed — the link is all there is, and by the time
 * anyone looks the advert is usually down. So the field starts empty and fills as
 * postings are attached from the Tailor tab; the analysis that reads it says how
 * many applications it could not see rather than pretending the gap is not there.
 *
 * The branches are `if`, not `else if`: a browser that skipped a release arrives
 * with `from` well behind and has to run every step in order.
 */
export function migratePersisted(persisted: unknown, from: number): Persisted {
  const s = (persisted ?? {}) as Persisted;
  if (from < 2) {
    s.restorePoints ??= [];
    if (s.db && !s.db.tags) {
      const seen = new Set<string>();
      for (const v of s.db.variants ?? []) if (v.name) seen.add(v.name);
      for (const e of s.db.entries ?? []) {
        for (const x of e.tags) seen.add(x);
        for (const b of e.bullets) for (const x of b.tags) seen.add(x);
      }
      for (const k of s.db.skills ?? []) for (const x of k.tags) seen.add(x);
      s.db.tags = seen.size ? [...seen] : [...SEED.tags];
    }
  }
  if (from < 3) {
    for (const a of s.db?.applications ?? []) a.jd ??= "";
  }
  return s;
}

/**
 * Whether a database is still the demo content nobody has touched.
 *
 * Cheap and approximate on purpose, and it is allowed to be wrong in either
 * direction: a false "untouched" costs one edit before the backup warning
 * appears, and a false "touched" shows a backup prompt a little early.
 */
export const looksUntouched = (db: DB) =>
  db.applications.length === 0 &&
  db.entries.length === SEED.entries.length &&
  db.profile.name === SEED.profile.name;

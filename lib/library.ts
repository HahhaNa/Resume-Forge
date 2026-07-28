/**
 * The shared library, seen from above.
 *
 * Entries, bullets and skill groups live once in `db` and every variant only holds
 * references to them. What was missing was the reverse view — one entry, all variants —
 * and the rules for putting an entry into a variant that has never carried it: which
 * section it joins, where in that section it sits, and which of its bullets switch on.
 * Those rules are here, as pure functions, so the store and the table agree.
 */

import { uid } from "./id";
import type { DB, Entry, EntryKind, Variant, VariantSection } from "./types";

export const ALL_TAGS = ["hw", "ml", "sw", "tw"];

export const KINDS: EntryKind[] = ["education", "experience", "project", "award", "activity"];

export const KIND_ABBR: Record<EntryKind, string> = {
  education: "edu",
  experience: "exp",
  project: "prj",
  award: "awd",
  activity: "act",
};

/** What to call a section that has to be invented because the variant has nowhere to put this. */
export const KIND_SECTION: Record<EntryKind, string> = {
  education: "Education",
  experience: "Experience",
  project: "Projects",
  award: "Awards & Honors",
  activity: "Activities",
};

const norm = (s: string) => s.trim().toLowerCase();

export const sectionHolding = (v: Variant, id: string) => v.sections.find((s) => s.ids.includes(id));

export const isInVariant = (v: Variant, id: string) => v.sections.some((s) => s.ids.includes(id));

/** The hue an entry answers to: its own tag, else the tag most of its bullets carry. */
export function entryHue(e: Entry): string | undefined {
  const own = e.tags.find((x) => ALL_TAGS.includes(x));
  if (own) return own;
  const count = new Map<string, number>();
  for (const b of e.bullets) for (const tg of b.tags) count.set(tg, (count.get(tg) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** An entry with no ticked bullets is dropped by `resolve` — except these two kinds. */
export const needsBullets = (kind: EntryKind) => kind !== "education" && kind !== "award";

/**
 * Which section of `v` an entry should join. A section titled the same as the one
 * carrying it in another variant wins; then the section already full of that kind;
 * then the only entries section there is. null means "nothing suitable — make one".
 */
export function pickSection(db: DB, v: Variant, entry: Entry): VariantSection | null {
  const secs = v.sections.filter((s) => s.type === "entries");
  if (!secs.length) return null;

  for (const other of db.variants) {
    if (other.id === v.id) continue;
    const title = sectionHolding(other, entry.id)?.title;
    if (!title) continue;
    const hit = secs.find((s) => norm(s.title) === norm(title));
    if (hit) return hit;
  }

  const byId = new Map(db.entries.map((e) => [e.id, e]));
  let best: VariantSection | null = null;
  let bestScore = 0;
  for (const s of secs) {
    const score = s.ids.filter((i) => byId.get(i)?.kind === entry.kind).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  if (best) return best;

  return secs.length === 1 ? secs[0] : null;
}

/** Sit behind the same neighbour this entry has in a variant that already lists it. */
function insertAt(db: DB, v: Variant, sec: VariantSection, entryId: string): number {
  for (const other of db.variants) {
    if (other.id === v.id) continue;
    const os = sectionHolding(other, entryId);
    if (!os) continue;
    const i = os.ids.indexOf(entryId);
    for (let k = i - 1; k >= 0; k--) {
      const at = sec.ids.indexOf(os.ids[k]);
      if (at >= 0) return at + 1;
    }
    for (let k = i + 1; k < os.ids.length; k++) {
      const at = sec.ids.indexOf(os.ids[k]);
      if (at >= 0) return at;
    }
  }
  return sec.ids.length;
}

/** Where a freshly made section belongs: the slot the same title occupies elsewhere. */
function sectionSlot(db: DB, v: Variant, title: string): number {
  for (const other of db.variants) {
    if (other.id === v.id) continue;
    const at = other.sections.findIndex((s) => norm(s.title) === norm(title));
    if (at >= 0) return Math.min(at, v.sections.length);
  }
  return v.sections.length;
}

/** What switches on when an entry first joins a variant: its tagged bullets, else all of them. */
export function defaultBulletIds(v: Variant, entry: Entry): string[] {
  const tagged = entry.bullets.filter((b) => b.tags.includes(v.name));
  return (tagged.length ? tagged : entry.bullets).map((b) => b.id);
}

/**
 * Put an entry into a variant. `withBullets` false only files it under a section —
 * used when ticking one specific bullet, which is its own selection.
 */
export function addEntryToVariant(db: DB, v: Variant, entry: Entry, withBullets = true): Variant {
  let sections = v.sections;
  if (!isInVariant(v, entry.id)) {
    const target = pickSection(db, v, entry);
    if (target) {
      const at = insertAt(db, v, target, entry.id);
      sections = v.sections.map((s) =>
        s.id === target.id
          ? { ...s, ids: [...s.ids.slice(0, at), entry.id, ...s.ids.slice(at)] }
          : s
      );
    } else {
      const title = KIND_SECTION[entry.kind];
      const sec: VariantSection = { id: uid("s"), title, type: "entries", ids: [entry.id] };
      const slot = sectionSlot(db, v, title);
      sections = [...v.sections.slice(0, slot), sec, ...v.sections.slice(slot)];
    }
  }

  // an existing tick pattern is a decision the user made — never overwrite it
  const already = entry.bullets.some((b) => v.bulletIds.includes(b.id));
  const bulletIds =
    withBullets && !already ? [...v.bulletIds, ...defaultBulletIds(v, entry)] : v.bulletIds;

  return { ...v, sections, bulletIds };
}

/** Unfile an entry or skill group. Bullet ticks stay, so putting it back restores the selection. */
export function removeFromVariant(v: Variant, id: string): Variant {
  if (!isInVariant(v, id)) return v;
  return { ...v, sections: v.sections.map((s) => ({ ...s, ids: s.ids.filter((i) => i !== id) })) };
}

export function addSkillToVariant(db: DB, v: Variant, skillId: string): Variant {
  if (isInVariant(v, skillId)) return v;
  const sec = v.sections.find((s) => s.type === "skills");
  if (sec) {
    return {
      ...v,
      sections: v.sections.map((s) => (s.id === sec.id ? { ...s, ids: [...s.ids, skillId] } : s)),
    };
  }
  const title = "Technical Skills";
  const made: VariantSection = { id: uid("s"), title, type: "skills", ids: [skillId] };
  const slot = sectionSlot(db, v, title);
  return { ...v, sections: [...v.sections.slice(0, slot), made, ...v.sections.slice(slot)] };
}

/** How much of an entry a variant actually renders. */
export function entryUse(v: Variant, e: Entry) {
  const on = new Set(v.bulletIds);
  const used = e.bullets.filter((b) => on.has(b.id)).length;
  return { inVariant: isInVariant(v, e.id), used, total: e.bullets.length };
}

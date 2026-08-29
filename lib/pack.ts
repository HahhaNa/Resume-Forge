/* ------------------------------------------------------------------ *
 * Filling exactly one page.
 *
 * This is the half of the feature that is not allowed to be a language
 * model. Asking one to "pick bullets that fit on one page" gets you a
 * confident answer and a resume that is 1.3 pages long, because nothing
 * in the prompt can see a line break. So the model does the only thing
 * it is actually better at — deciding how much a line of your history
 * answers a line of the posting — and hands back a number per bullet.
 * Everything from there is arithmetic against `fit.ts`.
 *
 * The shape of the problem is a knapsack with setup costs: a bullet
 * costs one line, but the *first* bullet of an entry also drags in the
 * entry's heading, and the first entry of a section drags in the
 * section rule. So the marginal cost of a bullet depends on what is
 * already on the page, and the greedy rule has to be score per marginal
 * height, re-ranked every round, rather than score alone. Exact
 * knapsack would be dynamic programming over a real-valued capacity for
 * a gain measured in a made-up unit — the ranking is the approximation
 * that matters here, not the packing, so a re-ranking greedy plus a
 * top-up pass is where the effort stops.
 *
 * The last pass is the one that earns its place: greedy stops when the
 * best-value candidate no longer fits, and there is usually room left
 * for a *cheap* one. `topUp` spends that, which is the difference
 * between a page that reads 0.91 full and one that reads 0.99.
 * ------------------------------------------------------------------ */

import { bulletHeight, gaps, headHeight, headerHeight, lineCount, metrics } from "./fit";
import type { Metrics } from "./fit";
import { KIND_SECTION, needsBullets } from "./library";
import { resolve } from "./resume";
import { uid } from "./id";
import type { DB, Entry, Variant, VariantSection } from "./types";

/* ------------------------------------------------------------------ *
 * the page under construction
 * ------------------------------------------------------------------ */

interface Slot {
  entry: Entry;
  bulletIds: string[];
}

interface Sec {
  title: string;
  type: "entries" | "skills";
  slots: Slot[];
  skillIds: string[];
}

interface Page {
  secs: Sec[];
}

/** Contact rows do not change with the selection, so they are measured once. */
function chromeHeight(db: DB, base: Variant, m: Metrics): number {
  return headerHeight(resolve(db, { ...base, sections: [], bulletIds: [] }), m);
}

function secHeight(sec: Sec, db: DB, m: Metrics, first: boolean): number {
  const g = m.g;
  let h = (first ? g.sectionFirst : g.section) + m.base * 1.18 + 1 + g.sectionAfter + g.topsep;
  if (sec.type === "skills") {
    const byId = new Map(db.skills.map((s) => [s.id, s]));
    const w = m.contentW - 0.15 * 96;
    for (const id of sec.skillIds) {
      const s = byId.get(id);
      if (s) h += lineCount(`${s.label}: ${s.items}`, w, m.small) * m.small * m.leadSm;
    }
    return h;
  }
  sec.slots.forEach((slot, i) => {
    if (i) {
      const prev = sec.slots[i - 1];
      h += prev.entry.kind === "award" || prev.bulletIds.length ? g.entryAfterBullets : g.entry;
    }
    h += headHeight(slot.entry, m);
    if (slot.bulletIds.length) {
      const byId = new Map(slot.entry.bullets.map((b) => [b.id, b]));
      h += g.topsep;
      slot.bulletIds.forEach((id, k) => {
        if (k) h += g.bullet;
        h += bulletHeight(byId.get(id)?.text ?? "", m);
      });
    }
  });
  return h;
}

function pageHeight(page: Page, db: DB, m: Metrics, chrome: number): number {
  /* an entries section with nothing in it does not render — `resolve` drops it,
     so it must not be charged for here either */
  const live = page.secs.filter((s) => (s.type === "skills" ? s.skillIds.length : s.slots.length));
  return live.reduce((h, s, i) => h + secHeight(s, db, m, i === 0), chrome);
}

/* ------------------------------------------------------------------ *
 * placing things
 * ------------------------------------------------------------------ */

/**
 * Section order follows the variant this one is derived from, so a tailored
 * resume comes out looking like the user's own layout rather than this file's
 * idea of one. Sections the base does not have are appended in the order the
 * kinds are declared, which is the same order `library.ts` invents them in.
 */
function scaffold(base: Variant): Page {
  return {
    secs: base.sections.map((s) => ({ title: s.title, type: s.type, slots: [], skillIds: [] })),
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The same rule `pickSection` files an entry under, re-stated against a page
 * that starts empty: a section titled the way some variant already titles this
 * entry's home wins, then the section the base variant fills with this kind,
 * then the only entries section there is. Undefined means "make one" — which is
 * what stops a project from being filed under Experience just because
 * Experience happened to be listed first.
 */
function sectionFor(page: Page, db: DB, base: Variant, e: Entry): Sec | undefined {
  const entries = page.secs.filter((s) => s.type === "entries");
  if (!entries.length) return undefined;

  for (const v of db.variants) {
    const title = v.sections.find((s) => s.ids.includes(e.id))?.title;
    if (!title) continue;
    const hit = entries.find((s) => norm(s.title) === norm(title));
    if (hit) return hit;
  }

  const named = entries.find((s) => norm(s.title) === norm(KIND_SECTION[e.kind]));
  if (named) return named;

  const byId = new Map(db.entries.map((x) => [x.id, x]));
  let best: Sec | undefined;
  let bestScore = 0;
  for (const s of entries) {
    const ids = base.sections.find((b) => b.title === s.title)?.ids ?? [];
    const score =
      ids.filter((i) => byId.get(i)?.kind === e.kind).length +
      s.slots.filter((x) => x.entry.kind === e.kind).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  if (best) return best;

  return entries.length === 1 ? entries[0] : undefined;
}

/** Base-variant order inside a section; anything new lands after what it knows. */
function slotIndex(sec: Sec, base: Variant, entryId: string): number {
  const known = base.sections.find((s) => s.title === sec.title)?.ids ?? [];
  const rank = (id: string) => {
    const i = known.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const mine = rank(entryId);
  const at = sec.slots.findIndex((s) => rank(s.entry.id) > mine);
  return at < 0 ? sec.slots.length : at;
}

function place(page: Page, db: DB, base: Variant, e: Entry, bulletId: string | null): Page {
  let secs = page.secs;
  let sec = sectionFor(page, db, base, e);
  if (!sec) {
    sec = { title: KIND_SECTION[e.kind], type: "entries", slots: [], skillIds: [] };
    secs = [...secs, sec];
  }
  const target = sec;
  const slot = target.slots.find((s) => s.entry.id === e.id);
  const next: Sec = slot
    ? {
        ...target,
        slots: target.slots.map((s) =>
          s.entry.id === e.id && bulletId
            ? { ...s, bulletIds: orderBullets(e, [...s.bulletIds, bulletId]) }
            : s
        ),
      }
    : (() => {
        const made: Slot = { entry: e, bulletIds: bulletId ? [bulletId] : [] };
        const at = slotIndex(target, base, e.id);
        return { ...target, slots: [...target.slots.slice(0, at), made, ...target.slots.slice(at)] };
      })();
  return { secs: secs.map((s) => (s === target ? next : s)) };
}

/** Bullets keep the order they were written in, never the order they were scored in. */
const orderBullets = (e: Entry, ids: string[]) =>
  e.bullets.filter((b) => ids.includes(b.id)).map((b) => b.id);

function placeSkill(page: Page, skillId: string): Page {
  let secs = page.secs;
  let sec = secs.find((s) => s.type === "skills");
  if (!sec) {
    sec = { title: "Technical Skills", type: "skills", slots: [], skillIds: [] };
    secs = [...secs, sec];
  }
  const target = sec;
  if (target.skillIds.includes(skillId)) return page;
  return {
    secs: secs.map((s) => (s === target ? { ...s, skillIds: [...s.skillIds, skillId] } : s)),
  };
}

/* ------------------------------------------------------------------ *
 * the packer
 * ------------------------------------------------------------------ */

export interface PackItem {
  /** bullet id, or skill-group id */
  id: string;
  kind: "bullet" | "skill";
  entryId: string;
  /** how well this answers the posting, 0..1 */
  score: number;
}

export interface PackOptions {
  /** how many pages to fill. The whole point is 1; 2 is here because variants allow it. */
  pages?: number;
  /**
   * Entries that go on the page whatever the model thinks. Education is the
   * usual case: a degree is not a claim that has to earn its line.
   */
  pinnedEntryIds?: string[];
  /** stop adding once the page is this full; the rest is the printer's tolerance */
  ceiling?: number;
}

export interface PackResult {
  /** doc ids that made the page, in no particular order */
  chosen: string[];
  /** what did not fit, best first — the "nearly made it" list worth showing */
  dropped: PackItem[];
  /** estimated pages, on the same scale the fill gauge reports */
  fill: number;
  sections: VariantSection[];
  bulletIds: string[];
}

/**
 * `ceiling` is 0.995 rather than 1: the estimate is good to about a line, and
 * the direction to be wrong in is "left a sliver of white space", not "pushed a
 * word onto a second sheet that is otherwise blank".
 */
const CEILING = 0.995;

export function pack(db: DB, base: Variant, items: PackItem[], opts: PackOptions = {}): PackResult {
  const m = metrics(base);
  const chrome = chromeHeight(db, base, m);
  const budget = m.pageH * (opts.pages ?? base.pageTarget ?? 1) * (opts.ceiling ?? CEILING);
  const entries = new Map(db.entries.map((e) => [e.id, e]));

  let page = scaffold(base);
  const chosen = new Set<string>();

  /* pinned entries first — they are not competing for the space, they are what is
     left of it after the facts. An education entry carries no bullets, so it costs
     its heading and nothing more. */
  for (const id of opts.pinnedEntryIds ?? []) {
    const e = entries.get(id);
    if (e && !needsBullets(e.kind)) page = place(page, db, base, e, null);
  }

  const height = () => pageHeight(page, db, m, chrome);
  const trial = (it: PackItem): { next: Page; cost: number } | null => {
    if (it.kind === "skill") {
      const next = placeSkill(page, it.id);
      return { next, cost: pageHeight(next, db, m, chrome) - height() };
    }
    const e = entries.get(it.entryId);
    if (!e || !e.bullets.some((b) => b.id === it.id)) return null;
    const next = place(page, db, base, e, it.id);
    return { next, cost: pageHeight(next, db, m, chrome) - height() };
  };

  const pool = items.filter((i) => i.score > 0).sort((a, b) => b.score - a.score);
  const left = new Set(pool.map((i) => i.id));

  /* --- greedy: best score per marginal inch, re-ranked every round --- */
  for (;;) {
    let best: { item: PackItem; next: Page; value: number } | null = null;
    const h = height();
    for (const it of pool) {
      if (!left.has(it.id)) continue;
      const t = trial(it);
      if (!t) continue;
      if (h + t.cost > budget) continue;
      /* a bullet that costs nothing extra — the second line of an entry already on
         the page — must not divide by zero into an infinite score */
      const value = it.score / Math.max(t.cost, 1);
      if (!best || value > best.value) best = { item: it, next: t.next, value };
    }
    if (!best) break;
    page = best.next;
    chosen.add(best.item.id);
    left.delete(best.item.id);
  }

  /* --- top-up: greedy stopped on value, so try the cheap ones on cost alone --- */
  for (const it of pool) {
    if (!left.has(it.id)) continue;
    const t = trial(it);
    if (!t || height() + t.cost > budget) continue;
    page = t.next;
    chosen.add(it.id);
    left.delete(it.id);
  }

  /* --- hand back a variant's worth of structure --- */
  const live = page.secs.filter((s) => (s.type === "skills" ? s.skillIds.length : s.slots.length));
  const sections: VariantSection[] = live.map((s) => ({
    id: uid("s"),
    title: s.title,
    type: s.type,
    ids: s.type === "skills" ? s.skillIds : s.slots.map((x) => x.entry.id),
  }));
  const bulletIds = live.flatMap((s) => s.slots.flatMap((x) => x.bulletIds));

  return {
    chosen: [...chosen],
    dropped: pool.filter((i) => left.has(i.id)),
    fill: height() / m.pageH,
    sections,
    bulletIds,
  };
}

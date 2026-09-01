"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED } from "./seed";
import { looksUntouched, migratePersisted, SCHEMA_VERSION } from "./migrate";
import { uid, today } from "./id";
import {
  addEntryToVariant,
  addSkillToVariant,
  removeFromVariant,
} from "./library";
import { buildTex } from "./resume";
import type { Draft } from "./import";
import type {
  Application,
  Bullet,
  DB,
  Snapshot,
  Entry,
  Lang,
  Platform,
  Problem,
  Profile,
  RestorePoint,
  SkillGroup,
  UndoStep,
  Variant,
  VariantSection,
} from "./types";
import { MAX_RESTORE_POINTS, MAX_UNDO, REVIEW_INTERVALS, UNDO_COALESCE_MS } from "./types";

export { uid, today };
const stamp = () => new Date().toISOString();

export type ImportMode = "replace" | "append" | "variant";

interface UI {
  lang: Lang;
  theme: "light" | "dark" | "system";
  activeVariantId: string;
}

interface Store extends UI {
  db: DB;
  hydrated: boolean;

  /**
   * When we first saw the user change something of their own — empty until
   * then. This is the difference between someone poking at the demo and
   * someone an evening into their real résumé, and it is the only thing that
   * makes it safe to warn about a missing backup: nagging a stranger who is
   * still looking around is how you get the tab closed.
   *
   * Set once by `step()` and never cleared. Not a precise "first edit" for
   * installs that predate it — see `onRehydrateStorage`, which infers it from
   * the data rather than pretending a full library is untouched.
   */
  ownWorkAt: string;

  setLang: (l: Lang) => void;
  setTheme: (t: UI["theme"]) => void;
  setActiveVariant: (id: string) => void;

  patchProfile: (p: Partial<Profile>) => void;

  addEntry: (e: Partial<Entry>) => string;
  patchEntry: (id: string, e: Partial<Entry>) => void;
  removeEntry: (id: string) => void;

  addBullet: (entryId: string, text?: string) => string;
  patchBullet: (entryId: string, bulletId: string, b: Partial<Bullet>) => void;
  removeBullet: (entryId: string, bulletId: string) => void;
  moveBullet: (entryId: string, bulletId: string, dir: -1 | 1) => void;

  addSkill: (s?: Partial<SkillGroup>) => string;
  patchSkill: (id: string, s: Partial<SkillGroup>) => void;
  removeSkill: (id: string) => void;

  addVariant: (cloneFrom?: string) => string;
  addTailoredVariant: (v: {
    name: string;
    label: string;
    note: string;
    sections: VariantSection[];
    bulletIds: string[];
    /** typography and header are inherited from this variant, never invented */
    from?: string;
  }) => string;
  patchVariant: (id: string, v: Partial<Variant>) => void;
  removeVariant: (id: string) => void;
  /** reword one bullet for one variant; the library keeps the original */
  setRewrite: (variantId: string, bulletId: string, text: string, forApp?: string) => void;
  /** put the library's own wording back */
  clearRewrite: (variantId: string, bulletId: string) => void;
  toggleBulletInVariant: (variantId: string, bulletId: string) => void;
  setBulletsInVariant: (variantId: string, bulletIds: string[], on: boolean) => void;
  toggleEntryInVariant: (variantId: string, sectionId: string, entryId: string) => void;
  /** Library view: file an entry into a variant (picking the section) or unfile it. */
  setEntryInVariant: (variantId: string, entryId: string, on: boolean) => void;
  setEntryEverywhere: (entryId: string, on: boolean) => void;
  setSkillInVariant: (variantId: string, skillId: string, on: boolean) => void;
  setSkillEverywhere: (skillId: string, on: boolean) => void;
  /** Tick one bullet in a variant, pulling its entry in if the variant lacks it. */
  setBulletInVariant: (variantId: string, bulletId: string, on: boolean) => void;
  moveEntryInVariant: (variantId: string, sectionId: string, entryId: string, dir: -1 | 1) => void;
  addSectionToVariant: (variantId: string, title: string, type: "entries" | "skills") => void;
  patchSection: (variantId: string, sectionId: string, patch: { title?: string; ids?: string[] }) => void;
  removeSection: (variantId: string, sectionId: string) => void;
  moveSection: (variantId: string, sectionId: string, dir: -1 | 1) => void;

  addApplication: (a: Partial<Application>) => string;
  patchApplication: (id: string, a: Partial<Application>) => void;
  removeApplication: (id: string) => void;

  addPlatform: (p?: Partial<Platform>) => string;
  patchPlatform: (id: string, p: Partial<Platform>) => void;
  removePlatform: (id: string) => void;

  addProblem: (p: Partial<Problem>) => string;
  patchProblem: (id: string, p: Partial<Problem>) => void;
  removeProblem: (id: string) => void;
  gradeProblem: (id: string, confidence: 1 | 2 | 3 | 4 | 5) => void;

  addTag: (name: string) => void;
  renameTag: (from: string, to: string) => void;
  removeTag: (name: string) => void;
  moveTag: (name: string, dir: -1 | 1) => void;

  importDB: (db: DB) => void;
  /**
   * `append` files the import alongside what you have, under a new variant.
   * `variant` keeps the whole library and rewrites only the variant you are on.
   * `replace` throws the library away — the blunt one, and rarely the one you want.
   */
  importDraft: (
    draft: Draft,
    mode: ImportMode,
    sourceName?: string
  ) => { variantId: string; entries: number; restorePointId: string };
  resetDB: () => void;

  /** Whole-database copies taken before anything destructive, newest first. */
  restorePoints: RestorePoint[];
  restore: (id: string) => boolean;
  dropRestorePoint: (id: string) => void;

  /* ---- undo ---------------------------------------------------------- *
   * Every action that changes the database is undoable. The two stacks hold
   * the database on either side of where you are standing: `past[0]` is what
   * Cmd-Z puts back, `future[0]` is what Shift-Cmd-Z puts back after that.
   * See UndoStep in types.ts for why they are cheap and why they are not
   * persisted. */
  past: UndoStep[];
  future: UndoStep[];
  /**
   * The last thing worth telling the user about — a deletion, or any action
   * they just undid. The toast reads this; everything else edits in silence.
   */
  notice: { id: string; label: string; undone: boolean } | null;
  undo: () => boolean;
  redo: () => boolean;
  clearNotice: () => void;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** A restore point for the database as it stands, newest first, oldest trimmed. */
const withRestorePoint = (s: { db: DB; restorePoints: RestorePoint[] }, label: string) =>
  [{ id: uid("rp"), at: stamp(), label, db: clone(s.db) }, ...s.restorePoints].slice(
    0,
    MAX_RESTORE_POINTS
  );

/** Where the database stands right now, ready to be pushed onto either stack. */
const stepOf = (s: Store, label: string, coalesce?: string): UndoStep => ({
  id: uid("u"),
  at: Date.now(),
  label,
  coalesce,
  db: s.db,
  activeVariantId: s.activeVariantId,
});

/**
 * Wraps a recipe so the database it replaces becomes an undo step.
 *
 * An action that decides it has nothing to do returns the state it was given, and
 * a step whose database is the one already on screen would be an undo that does
 * nothing — so identity is the test for "did anything happen".
 *
 * `coalesce` names the field being edited. Typing a bullet fires an action per
 * keystroke, and a stack of those would make Cmd-Z walk back one character at a
 * time, so consecutive edits to the same field within a second extend the step
 * that is already there instead of pushing a new one.
 */
const step =
  (label: string, recipe: (s: Store) => Partial<Store> | Store, coalesce?: string) =>
  (s: Store): Partial<Store> => {
    const patch = recipe(s) as Partial<Store>;
    if (!patch.db || patch.db === s.db) return patch;
    const head = s.past[0];
    const extend =
      coalesce !== undefined && head?.coalesce === coalesce && Date.now() - head.at < UNDO_COALESCE_MS;
    return {
      ...patch,
      // every database change in the app comes through here, so this is the
      // one place that needs to know the demo has become someone's own work
      ownWorkAt: s.ownWorkAt || stamp(),
      past: extend ? s.past : [stepOf(s, label, coalesce), ...s.past].slice(0, MAX_UNDO),
      // a fresh edit is a new branch: whatever redo was holding is unreachable now
      future: [],
      // the toast undoes the top of the stack, so it may only outlive the action it
      // is talking about for as long as that action stays on top
      notice: null,
    };
  };

/**
 * A deletion. Undoable like any other action, and announced — the row is gone from
 * under the cursor, and a toast offering Undo is the only thing that says so.
 */
const del = (label: string, recipe: (s: Store) => Partial<Store> | Store) => {
  const inner = step(label, recipe);
  return (s: Store): Partial<Store> => {
    const patch = inner(s);
    return patch.past ? { ...patch, notice: { id: uid("n"), label, undone: false } } : patch;
  };
};

/**
 * The résumé as it stands, frozen against an application.
 *
 * Taken the moment an application stops being a bookmark and becomes something you sent,
 * because that is the only moment the answer is knowable. Six weeks later, walking into
 * the interview, "which version did they read?" has no answer left in the data: the variant
 * still exists but you have edited it four times since, for other companies. Waiting for
 * the user to remember to press a button means the field is empty exactly when it matters.
 *
 * Returns undefined when the variant is gone, which is not worth failing the status change
 * over — an application whose variant was deleted is precisely one you can no longer
 * reconstruct, and blocking the edit would not bring it back.
 */
const snapshotOf = (db: DB, variantId: string): Snapshot | undefined => {
  const v = db.variants.find((x) => x.id === variantId);
  if (!v) return undefined;
  return {
    builtAt: stamp(),
    variantName: v.name,
    bulletIds: [...v.bulletIds],
    tex: buildTex(db, v),
  };
};

/** "Saved" is a bookmark; everything past it means the résumé left the building. */
const isSent = (st: Application["status"]) => st !== "saved";

export const normTag = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 12);

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      db: clone(SEED),
      hydrated: false,
      ownWorkAt: "",
      lang: "en",
      theme: "system",
      activeVariantId: SEED.variants[0].id,

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setActiveVariant: (activeVariantId) => set({ activeVariantId }),

      patchProfile: (p) =>
        set(
          step(
            "Profile edited",
            (s) => ({ db: { ...s.db, profile: { ...s.db.profile, ...p } } }),
            `profile:${Object.keys(p).join(",")}`
          )
        ),

      addEntry: (e) => {
        const id = uid("e");
        set(step("Entry added", (s) => ({
          db: {
            ...s.db,
            entries: [
              ...s.db.entries,
              {
                id,
                kind: "project",
                org: "New entry",
                title: "",
                location: "",
                period: "",
                bullets: [],
                tags: [],
                ...e,
              } as Entry,
            ],
          },
        })));
        return id;
      },
      patchEntry: (id, e) =>
        set(
          step(
            "Entry edited",
            (s) => ({
              db: { ...s.db, entries: s.db.entries.map((x) => (x.id === id ? { ...x, ...e } : x)) },
            }),
            `entry:${id}:${Object.keys(e).join(",")}`
          )
        ),
      removeEntry: (id) =>
        set(del("Entry deleted", (s) => ({
          // an entry takes its bullets with it — worth a restore point of its own,
          // because undo only reaches back as far as this session
          restorePoints: s.db.entries.find((x) => x.id === id)?.bullets.length
            ? withRestorePoint(s, "Before deleting an entry and its bullets")
            : s.restorePoints,
          db: {
            ...s.db,
            entries: s.db.entries.filter((x) => x.id !== id),
            variants: s.db.variants.map((v) => ({
              ...v,
              sections: v.sections.map((sec) => ({ ...sec, ids: sec.ids.filter((i) => i !== id) })),
            })),
          },
        }))),

      addBullet: (entryId, text = "") => {
        const id = uid("b");
        set(step("Bullet added", (s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.map((e) =>
              e.id === entryId ? { ...e, bullets: [...e.bullets, { id, text, tags: [] }] } : e
            ),
          },
        })));
        return id;
      },
      patchBullet: (entryId, bulletId, b) =>
        set(
          step(
            "Bullet edited",
            (s) => ({
              db: {
                ...s.db,
                entries: s.db.entries.map((e) =>
                  e.id === entryId
                    ? { ...e, bullets: e.bullets.map((x) => (x.id === bulletId ? { ...x, ...b } : x)) }
                    : e
                ),
              },
            }),
            `bullet:${bulletId}:${Object.keys(b).join(",")}`
          )
        ),
      removeBullet: (entryId, bulletId) =>
        set(del("Bullet deleted", (s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.map((e) =>
              e.id === entryId ? { ...e, bullets: e.bullets.filter((x) => x.id !== bulletId) } : e
            ),
            variants: s.db.variants.map((v) => ({
              ...v,
              bulletIds: v.bulletIds.filter((i) => i !== bulletId),
            })),
          },
        }))),
      moveBullet: (entryId, bulletId, dir) =>
        set(step("Bullets reordered", (s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.map((e) => {
              if (e.id !== entryId) return e;
              const i = e.bullets.findIndex((b) => b.id === bulletId);
              const j = i + dir;
              if (i < 0 || j < 0 || j >= e.bullets.length) return e;
              const bs = [...e.bullets];
              [bs[i], bs[j]] = [bs[j], bs[i]];
              return { ...e, bullets: bs };
            }),
          },
        }))),

      addSkill: (sk) => {
        const id = uid("sk");
        set(step("Skill group added", (s) => ({
          db: {
            ...s.db,
            skills: [...s.db.skills, { id, label: "New group", items: "", tags: [], ...sk }],
          },
        })));
        return id;
      },
      patchSkill: (id, sk) =>
        set(
          step(
            "Skill group edited",
            (s) => ({
              db: { ...s.db, skills: s.db.skills.map((x) => (x.id === id ? { ...x, ...sk } : x)) },
            }),
            `skill:${id}:${Object.keys(sk).join(",")}`
          )
        ),
      removeSkill: (id) =>
        set(del("Skill group deleted", (s) => ({
          db: {
            ...s.db,
            skills: s.db.skills.filter((x) => x.id !== id),
            variants: s.db.variants.map((v) => ({
              ...v,
              sections: v.sections.map((sec) => ({ ...sec, ids: sec.ids.filter((i) => i !== id) })),
            })),
          },
        }))),

      addVariant: (cloneFrom) => {
        const id = uid("v");
        const src = get().db.variants.find((v) => v.id === cloneFrom) ?? get().db.variants[0];
        const base: Variant = src
          ? clone(src)
          : {
              id,
              name: "new",
              label: "New variant",
              note: "",
              sections: [],
              bulletIds: [],
              header: { phone: true, linkedin: true, github: true, site: false },
              density: "tight",
              fontSize: 10,
              pageTarget: 1,
              updatedAt: stamp(),
            };
        const v: Variant = {
          ...base,
          id,
          name: `${base.name}-copy`,
          label: `${base.label} (copy)`,
          updatedAt: stamp(),
        };
        set(
          step("Variant added", (s) => ({
            db: { ...s.db, variants: [...s.db.variants, v] },
            activeVariantId: id,
          }))
        );
        return id;
      },

      /**
       * A variant whose selection was computed rather than clicked. It is a
       * plain variant from here on — editable, deletable, undoable — because a
       * tailored résumé the user cannot then argue with is not much use, and
       * because nothing downstream should have to know where a selection came
       * from. Only the typography and the header follow the variant it was
       * derived from; the sections and ticks are the packer's.
       */
      addTailoredVariant: ({ name, label, note, sections, bulletIds, from }) => {
        const id = uid("v");
        const src = get().db.variants.find((v) => v.id === from) ?? get().db.variants[0];
        const v: Variant = {
          id,
          name,
          label,
          note,
          sections,
          bulletIds,
          header: src?.header ?? { phone: true, linkedin: true, github: true, site: false },
          contact: src?.contact,
          linkStyle: src?.linkStyle,
          density: src?.density ?? "tight",
          fontSize: src?.fontSize ?? 10,
          pageTarget: src?.pageTarget ?? 1,
          updatedAt: stamp(),
        };
        set(
          step("Tailored variant added", (s) => ({
            db: { ...s.db, variants: [...s.db.variants, v] },
            activeVariantId: id,
          }))
        );
        return id;
      },
      patchVariant: (id, v) =>
        set(
          step(
            "Variant edited",
            (s) => ({
              db: {
                ...s.db,
                variants: s.db.variants.map((x) => (x.id === id ? { ...x, ...v, updatedAt: stamp() } : x)),
              },
            }),
            `variant:${id}:${Object.keys(v).join(",")}`
          )
        ),
      setRewrite: (variantId, bulletId, text, forApp) =>
        set(
          step(
            "Bullet reworded",
            (s) => ({
              db: {
                ...s.db,
                variants: s.db.variants.map((x) =>
                  x.id === variantId
                    ? {
                        ...x,
                        rewrites: { ...x.rewrites, [bulletId]: { text, at: stamp(), ...(forApp ? { forApp } : {}) } },
                        updatedAt: stamp(),
                      }
                    : x
                ),
              },
            }),
            /* one undo step per bullet, not per keystroke: accepting a rewrite is
               a single decision and ⌘Z should put back a single sentence */
            `rewrite:${variantId}:${bulletId}`
          )
        ),
      clearRewrite: (variantId, bulletId) =>
        set(
          step("Rewording reverted", (s) => ({
            db: {
              ...s.db,
              variants: s.db.variants.map((x) => {
                if (x.id !== variantId || !x.rewrites?.[bulletId]) return x;
                const { [bulletId]: _gone, ...rest } = x.rewrites;
                return { ...x, rewrites: rest, updatedAt: stamp() };
              }),
            },
          }))
        ),
      removeVariant: (id) =>
        set(
          del("Variant deleted", (s) => {
            const variants = s.db.variants.filter((x) => x.id !== id);
            if (variants.length === s.db.variants.length) return s;
            return {
              // a variant is a whole layout's worth of choices; keep a copy that
              // outlives the session, the way an import does
              restorePoints: withRestorePoint(s, "Before deleting a variant"),
              db: { ...s.db, variants },
              activeVariantId: s.activeVariantId === id ? variants[0]?.id ?? "" : s.activeVariantId,
            };
          })
        ),
      toggleBulletInVariant: (variantId, bulletId) =>
        set(step("Bullet toggled", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? {
                    ...v,
                    bulletIds: v.bulletIds.includes(bulletId)
                      ? v.bulletIds.filter((i) => i !== bulletId)
                      : [...v.bulletIds, bulletId],
                    updatedAt: stamp(),
                  }
                : v
            ),
          },
        }))),
      setBulletsInVariant: (variantId, bulletIds, on) =>
        set(step(on ? "Bullets added to the variant" : "Bullets removed from the variant", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              if (v.id !== variantId) return v;
              const set2 = new Set(v.bulletIds);
              bulletIds.forEach((b) => (on ? set2.add(b) : set2.delete(b)));
              return { ...v, bulletIds: [...set2], updatedAt: stamp() };
            }),
          },
        }))),
      toggleEntryInVariant: (variantId, sectionId, entryId) =>
        set(step("Entry toggled", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? {
                    ...v,
                    sections: v.sections.map((sec) =>
                      sec.id === sectionId
                        ? {
                            ...sec,
                            ids: sec.ids.includes(entryId)
                              ? sec.ids.filter((i) => i !== entryId)
                              : [...sec.ids, entryId],
                          }
                        : sec
                    ),
                    updatedAt: stamp(),
                  }
                : v
            ),
          },
        }))),
      setEntryInVariant: (variantId, entryId, on) =>
        set(step(on ? "Entry added to the variant" : "Entry removed from the variant", (s) => {
          const entry = s.db.entries.find((e) => e.id === entryId);
          if (!entry) return s;
          return {
            db: {
              ...s.db,
              variants: s.db.variants.map((v) => {
                if (v.id !== variantId) return v;
                const next = on
                  ? addEntryToVariant(s.db, v, entry)
                  : removeFromVariant(v, entryId);
                return next === v ? v : { ...next, updatedAt: stamp() };
              }),
            },
          };
        })),
      setEntryEverywhere: (entryId, on) =>
        set(step(on ? "Entry added everywhere" : "Entry removed everywhere", (s) => {
          const entry = s.db.entries.find((e) => e.id === entryId);
          if (!entry) return s;
          return {
            db: {
              ...s.db,
              variants: s.db.variants.map((v) => {
                const next = on
                  ? addEntryToVariant(s.db, v, entry)
                  : removeFromVariant(v, entryId);
                return next === v ? v : { ...next, updatedAt: stamp() };
              }),
            },
          };
        })),
      setSkillInVariant: (variantId, skillId, on) =>
        set(step(on ? "Skill group added to the variant" : "Skill group removed from the variant", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              if (v.id !== variantId) return v;
              const next = on
                ? addSkillToVariant(s.db, v, skillId)
                : removeFromVariant(v, skillId);
              return next === v ? v : { ...next, updatedAt: stamp() };
            }),
          },
        }))),
      setSkillEverywhere: (skillId, on) =>
        set(step(on ? "Skill group added everywhere" : "Skill group removed everywhere", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              const next = on
                ? addSkillToVariant(s.db, v, skillId)
                : removeFromVariant(v, skillId);
              return next === v ? v : { ...next, updatedAt: stamp() };
            }),
          },
        }))),
      setBulletInVariant: (variantId, bulletId, on) =>
        set(step(on ? "Bullet added to the variant" : "Bullet removed from the variant", (s) => {
          const entry = s.db.entries.find((e) => e.bullets.some((b) => b.id === bulletId));
          if (!entry) return s;
          return {
            db: {
              ...s.db,
              variants: s.db.variants.map((v) => {
                if (v.id !== variantId) return v;
                // ticking a bullet in a variant that does not carry the entry files it too,
                // otherwise the tick would be invisible
                const base = on ? addEntryToVariant(s.db, v, entry, false) : v;
                const has = base.bulletIds.includes(bulletId);
                const bulletIds =
                  on === has
                    ? base.bulletIds
                    : on
                      ? [...base.bulletIds, bulletId]
                      : base.bulletIds.filter((i) => i !== bulletId);
                return { ...base, bulletIds, updatedAt: stamp() };
              }),
            },
          };
        })),
      moveEntryInVariant: (variantId, sectionId, entryId, dir) =>
        set(step("Entries reordered", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              if (v.id !== variantId) return v;
              return {
                ...v,
                sections: v.sections.map((sec) => {
                  if (sec.id !== sectionId) return sec;
                  const i = sec.ids.indexOf(entryId);
                  const j = i + dir;
                  if (i < 0 || j < 0 || j >= sec.ids.length) return sec;
                  const ids = [...sec.ids];
                  [ids[i], ids[j]] = [ids[j], ids[i]];
                  return { ...sec, ids };
                }),
                updatedAt: stamp(),
              };
            }),
          },
        }))),
      addSectionToVariant: (variantId, title, type) =>
        set(step("Section added", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? { ...v, sections: [...v.sections, { id: uid("s"), title, type, ids: [] }], updatedAt: stamp() }
                : v
            ),
          },
        }))),
      patchSection: (variantId, sectionId, patch) =>
        set(step("Section edited", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? {
                    ...v,
                    sections: v.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...patch } : sec)),
                    updatedAt: stamp(),
                  }
                : v
            ),
          },
        }), `section:${sectionId}:${Object.keys(patch).join(",")}`)),
      removeSection: (variantId, sectionId) =>
        set(del("Section deleted", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? { ...v, sections: v.sections.filter((sec) => sec.id !== sectionId), updatedAt: stamp() }
                : v
            ),
          },
        }))),
      moveSection: (variantId, sectionId, dir) =>
        set(step("Sections reordered", (s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              if (v.id !== variantId) return v;
              const i = v.sections.findIndex((x) => x.id === sectionId);
              const j = i + dir;
              if (i < 0 || j < 0 || j >= v.sections.length) return v;
              const secs = [...v.sections];
              [secs[i], secs[j]] = [secs[j], secs[i]];
              return { ...v, sections: secs, updatedAt: stamp() };
            }),
          },
        }))),

      addApplication: (a) => {
        const id = uid("a");
        const status = a.status ?? "saved";
        set(step("Application added", (s) => ({
          db: {
            ...s.db,
            applications: [
              {
                id,
                company: "",
                role: "",
                team: "",
                location: "",
                region: "",
                variantId: s.activeVariantId,
                status,
                appliedAt: status === "saved" ? "" : today(),
                deadline: "",
                source: "",
                referral: "",
                jdUrl: "",
                jd: "",
                portal: "",
                nextAction: "",
                nextActionAt: "",
                notes: "",
                prepTopics: [],
                events: [{ at: today(), status }],
                ...a,
                snapshot:
                  a.snapshot ??
                  (isSent(status) ? snapshotOf(s.db, a.variantId ?? s.activeVariantId) : undefined),
              } as Application,
              ...s.db.applications,
            ],
          },
        })));
        return id;
      },
      patchApplication: (id, a) =>
        set(step("Application edited", (s) => ({
          db: {
            ...s.db,
            applications: s.db.applications.map((x) => {
              if (x.id !== id) return x;
              const next = { ...x, ...a };
              if (a.status && a.status !== x.status) {
                next.events = [...x.events, { at: today(), status: a.status }];
                if (a.status === "applied" && !next.appliedAt) next.appliedAt = today();
                // the first time it leaves "saved" — and only then, so a later move
                // through the funnel never overwrites what was actually sent
                if (!next.snapshot && isSent(a.status) && !isSent(x.status))
                  next.snapshot = snapshotOf(s.db, next.variantId);
              }
              return next;
            }),
          },
        }), `application:${id}:${Object.keys(a).join(",")}`)),
      removeApplication: (id) =>
        set(
          del("Application deleted", (s) => ({
            db: { ...s.db, applications: s.db.applications.filter((x) => x.id !== id) },
          }))
        ),

      addPlatform: (p) => {
        const id = uid("p");
        set(step("Platform added", (s) => ({
          db: {
            ...s.db,
            platforms: [
              ...s.db.platforms,
              { id, name: "New platform", url: "", kind: "other", color: "s5", target: 0, ...p },
            ],
          },
        })));
        return id;
      },
      patchPlatform: (id, p) =>
        set(
          step(
            "Platform edited",
            (s) => ({
              db: { ...s.db, platforms: s.db.platforms.map((x) => (x.id === id ? { ...x, ...p } : x)) },
            }),
            `platform:${id}:${Object.keys(p).join(",")}`
          )
        ),
      removePlatform: (id) =>
        set(
          del("Platform deleted", (s) => ({
            // the platform's whole solve log goes with it
            restorePoints: s.db.problems.some((x) => x.platformId === id)
              ? withRestorePoint(s, "Before deleting a platform and its problems")
              : s.restorePoints,
            db: {
              ...s.db,
              platforms: s.db.platforms.filter((x) => x.id !== id),
              problems: s.db.problems.filter((x) => x.platformId !== id),
            },
          }))
        ),

      addProblem: (p) => {
        const id = uid("q");
        set(step("Problem added", (s) => ({
          db: {
            ...s.db,
            problems: [
              {
                id,
                platformId: s.db.platforms[0]?.id ?? "",
                title: "",
                ref: "",
                url: "",
                difficulty: "",
                topics: [],
                status: "solved",
                solvedAt: today(),
                attempts: 1,
                confidence: 3,
                nextReviewAt: "",
                notes: "",
                ...p,
              } as Problem,
              ...s.db.problems,
            ],
          },
        })));
        return id;
      },
      patchProblem: (id, p) =>
        set(
          step(
            "Problem edited",
            (s) => ({
              db: { ...s.db, problems: s.db.problems.map((x) => (x.id === id ? { ...x, ...p } : x)) },
            }),
            `problem:${id}:${Object.keys(p).join(",")}`
          )
        ),
      removeProblem: (id) =>
        set(
          del("Problem deleted", (s) => ({
            db: { ...s.db, problems: s.db.problems.filter((x) => x.id !== id) },
          }))
        ),
      gradeProblem: (id, confidence) =>
        set(step("Problem graded", (s) => ({
          db: {
            ...s.db,
            problems: s.db.problems.map((x) => {
              if (x.id !== id) return x;
              const d = new Date();
              d.setDate(d.getDate() + REVIEW_INTERVALS[confidence]);
              return {
                ...x,
                confidence,
                status: "solved",
                solvedAt: x.solvedAt || today(),
                attempts: x.attempts + 1,
                nextReviewAt: d.toISOString().slice(0, 10),
              };
            }),
          },
        }))),

      /* ---- tags -------------------------------------------------------- *
       * The vocabulary is the user's, not the app's. Bullets, entries and
       * skill groups store tag names, so renaming one rewrites every use and
       * deleting one strips it — otherwise the data would keep orphan names. */

      addTag: (name) => {
        const tag = normTag(name);
        if (!tag) return;
        set(
          step("Tag added", (s) =>
            s.db.tags.includes(tag) ? s : { db: { ...s.db, tags: [...s.db.tags, tag] } }
          )
        );
      },

      renameTag: (from, to) => {
        const tag = normTag(to);
        if (!tag || tag === from) return;
        set(step("Tag renamed", (s) => {
          if (!s.db.tags.includes(from) || s.db.tags.includes(tag)) return s;
          const swap = (xs: string[]) => xs.map((x) => (x === from ? tag : x));
          return {
            db: {
              ...s.db,
              tags: swap(s.db.tags),
              entries: s.db.entries.map((e) => ({
                ...e,
                tags: swap(e.tags),
                bullets: e.bullets.map((b) => ({ ...b, tags: swap(b.tags) })),
              })),
              skills: s.db.skills.map((k) => ({ ...k, tags: swap(k.tags) })),
              // a variant named after the tag follows it, so hues stay attached
              variants: s.db.variants.map((v) => (v.name === from ? { ...v, name: tag } : v)),
            },
          };
        }));
      },

      removeTag: (name) =>
        set(del("Tag deleted", (s) => {
          if (!s.db.tags.includes(name)) return s;
          const drop = (xs: string[]) => xs.filter((x) => x !== name);
          return {
            // the tag is stripped from every bullet, entry and skill group that
            // carries it — too wide a change to leave to this session's undo alone
            restorePoints: withRestorePoint(s, `Before deleting the tag "${name}"`),
            db: {
              ...s.db,
              tags: drop(s.db.tags),
              entries: s.db.entries.map((e) => ({
                ...e,
                tags: drop(e.tags),
                bullets: e.bullets.map((b) => ({ ...b, tags: drop(b.tags) })),
              })),
              skills: s.db.skills.map((k) => ({ ...k, tags: drop(k.tags) })),
            },
          };
        })),

      moveTag: (name, dir) =>
        set(step("Tags reordered", (s) => {
          const i = s.db.tags.indexOf(name);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.db.tags.length) return s;
          const tags = [...s.db.tags];
          [tags[i], tags[j]] = [tags[j], tags[i]];
          return { db: { ...s.db, tags } };
        })),

      /**
       * A whole database from outside: a JSON export, or a backup file this
       * browser has decided to adopt.
       *
       * It goes through the same migration as data coming out of storage,
       * because it is the same problem — a file exported by an older release
       * is an older shape, and it arrives at a running app that will read it
       * expecting the current one. Every branch of `migratePersisted` is
       * written to be a no-op on data that already has the field, so the
       * version the file claims never has to be trusted: an export carries
       * `db.version`, which nothing has maintained since v1.
       */
      importDB: (raw) =>
        set(
          step("Backup imported", (s) => {
            const db = (migratePersisted({ db: raw }, 1).db ?? raw) as DB;
            return {
              restorePoints: withRestorePoint(s, "Before importing a JSON backup"),
              db,
              activeVariantId: db.variants[0]?.id ?? "",
            };
          })
        ),

      /**
       * Turn a parsed .tex/.pdf draft into entries, skills, and a variant that shows all of it.
       *
       * Which variant depends on the mode, and `variant` is the one worth explaining. Importing
       * a résumé you already wrote is usually not "here is my whole career, start over" — it is
       * "this is what /hw should say". So that mode adds the parsed entries to the library like
       * an append, and then repoints the variant you are standing on at them: the slug, the
       * label, the density and the page target all survive, because they are the part you tuned
       * and the import knows nothing about. Nothing is deleted — entries the variant used to
       * list are still in the library, and the Library tab's "In no variant" filter is where
       * they show up if nothing else carries them.
       *
       * All three modes take a restore point: `variant` and `replace` because they overwrite a
       * selection, `append` because an import you did not mean is easiest to undo wholesale.
       */
      importDraft: (draft, mode, sourceName) => {
        const st = get();
        // no variant to stand on — nothing to overwrite, so make one the way `append` does
        const target = mode === "variant" ? st.db.variants.find((v) => v.id === st.activeVariantId) : undefined;
        const into: ImportMode = mode === "variant" && !target ? "append" : mode;
        const entries: Entry[] = [];
        const skills: SkillGroup[] = [];
        const sections: Variant["sections"] = [];
        const bulletIds: string[] = [];

        draft.sections.forEach((sec) => {
          if (sec.type === "skills") {
            const ids = sec.skills.map((k) => {
              const sk: SkillGroup = { id: uid("sk"), label: k.label, items: k.items, tags: [] };
              skills.push(sk);
              return sk.id;
            });
            sections.push({ id: uid("s"), title: sec.title, type: "skills", ids });
            return;
          }
          const ids = sec.entries.map((e) => {
            const entry: Entry = {
              id: uid("e"),
              kind: e.kind,
              org: e.org,
              title: e.title,
              location: e.location,
              period: e.period,
              tags: [],
              bullets: e.bullets.map((text) => {
                const b: Bullet = { id: uid("b"), text, tags: [] };
                bulletIds.push(b.id);
                return b;
              }),
            };
            entries.push(entry);
            return entry.id;
          });
          sections.push({ id: uid("s"), title: sec.title, type: "entries", ids });
        });

        const suffix = into === "append" ? `-${st.db.variants.length + 1}` : "";
        // in `variant` mode the target keeps everything but its contents
        const variant: Variant =
          into === "variant" && target
            ? { ...target, sections, bulletIds, updatedAt: stamp() }
            : {
                id: uid("v"),
                name: `imported${suffix}`,
                label: `Imported (${draft.source.toUpperCase()})`,
                note: "",
                sections,
                bulletIds,
                header: { phone: true, linkedin: true, github: true, site: false },
                density: "tight",
                fontSize: 10,
                pageTarget: 1,
                updatedAt: stamp(),
              };

        // only touch profile fields the draft actually found, and only overwrite a filled one
        // when the whole library is going: retargeting one variant is not a change of identity
        const profile: Profile = { ...st.db.profile };
        (Object.keys(draft.profile) as (keyof Profile)[]).forEach((k) => {
          const v = draft.profile[k]?.trim();
          if (v && (into === "replace" || !profile[k])) profile[k] = v;
        });

        const label =
          into === "replace"
            ? "Everything replaced by an import"
            : into === "variant"
              ? `Variant /${variant.name} replaced by an import`
              : "Résumé imported";

        let restorePointId = "";
        set(step(label, (s) => {
          const variants =
            into === "replace"
              ? [variant]
              : into === "variant"
                ? s.db.variants.map((v) => (v.id === variant.id ? variant : v))
                : [...s.db.variants, variant];
          const live = new Set(variants.map((v) => v.id));
          const what = sourceName ? `"${sourceName}"` : `a ${draft.source.toUpperCase()} file`;
          const restorePoints = withRestorePoint(
            s,
            into === "replace"
              ? `Before replacing everything with ${what}`
              : into === "variant"
                ? `Before replacing /${variant.name} with ${what}`
                : `Before importing ${what}`
          );
          restorePointId = restorePoints[0].id;
          return {
            restorePoints,
            db: {
              ...s.db,
              profile,
              // only `replace` drops what was there; the other two keep the library whole
              entries: into === "replace" ? entries : [...s.db.entries, ...entries],
              skills: into === "replace" ? skills : [...s.db.skills, ...skills],
              variants,
              // replace drops the old variants — keep applications pointing somewhere real
              applications: s.db.applications.map((a) =>
                live.has(a.variantId) ? a : { ...a, variantId: variant.id }
              ),
            },
            activeVariantId: variant.id,
          };
        }));

        return { variantId: variant.id, entries: entries.length, restorePointId };
      },

      resetDB: () =>
        set(
          step("Reset to the demo content", (s) => ({
            restorePoints: withRestorePoint(s, "Before resetting to the demo content"),
            db: clone(SEED),
            activeVariantId: SEED.variants[0].id,
          }))
        ),

      restorePoints: [],

      /** Restoring is itself undoable — the database being replaced becomes a point too. */
      restore: (id) => {
        const rp = get().restorePoints.find((x) => x.id === id);
        if (!rp) return false;
        set(
          step("Restore point restored", (s) => ({
            restorePoints: withRestorePoint(s, `Before restoring "${rp.label}"`).filter(
              (x) => x.id !== id
            ),
            db: clone(rp.db),
            activeVariantId: rp.db.variants[0]?.id ?? "",
          }))
        );
        return true;
      },

      dropRestorePoint: (id) =>
        set((s) => ({ restorePoints: s.restorePoints.filter((x) => x.id !== id) })),

      past: [],
      future: [],
      notice: null,

      /**
       * Step back. The database on screen goes onto the redo stack under the label
       * of the action being reversed, so the toast can offer it back by name.
       */
      undo: () => {
        const s = get();
        const back = s.past[0];
        if (!back) return false;
        set({
          db: back.db,
          activeVariantId: back.activeVariantId,
          past: s.past.slice(1),
          future: [{ ...stepOf(s, back.label), id: back.id }, ...s.future].slice(0, MAX_UNDO),
          notice: { id: uid("n"), label: back.label, undone: true },
        });
        return true;
      },

      redo: () => {
        const s = get();
        const forward = s.future[0];
        if (!forward) return false;
        set({
          db: forward.db,
          activeVariantId: forward.activeVariantId,
          past: [{ ...stepOf(s, forward.label), id: forward.id }, ...s.past].slice(0, MAX_UNDO),
          future: s.future.slice(1),
          notice: { id: uid("n"), label: forward.label, undone: false },
        });
        return true;
      },

      clearNotice: () => set({ notice: null }),
    }),
    {
      name: "resume-forge",
      /* one number, defined next to the migration that answers for it — the two
         drifting apart means either a migration that never runs or one that runs
         against data it has already been applied to */
      version: SCHEMA_VERSION,
      /** The undo stacks are per-session; see UndoStep in types.ts. */
      partialize: ({ db, restorePoints, lang, theme, activeVariantId, ownWorkAt }) => ({
        db,
        restorePoints,
        lang,
        theme,
        activeVariantId,
        ownWorkAt,
      }),
      /** Older saved data, brought up to the current shape. See `lib/migrate.ts`. */
      migrate: (persisted, from) => migratePersisted(persisted, from) as Store,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.hydrated = true;
        // Installs from before this field existed would look untouched forever,
        // because nothing back-dates it. Infer it from the data instead: a
        // library that no longer matches the seed is somebody's actual work.
        if (!state.ownWorkAt && !looksUntouched(state.db)) state.ownWorkAt = stamp();
      },
    }
  )
);

export function useHydrated() {
  return useStore((s) => s.hydrated);
}

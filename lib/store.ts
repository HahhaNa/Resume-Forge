"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SEED } from "./seed";
import { uid, today } from "./id";
import {
  addEntryToVariant,
  addSkillToVariant,
  removeFromVariant,
} from "./library";
import type { Draft } from "./import";
import type {
  Application,
  Bullet,
  DB,
  Entry,
  Lang,
  Platform,
  Problem,
  Profile,
  SkillGroup,
  Variant,
} from "./types";
import { REVIEW_INTERVALS } from "./types";

export { uid, today };
const stamp = () => new Date().toISOString();

interface UI {
  lang: Lang;
  theme: "light" | "dark" | "system";
  activeVariantId: string;
}

interface Store extends UI {
  db: DB;
  hydrated: boolean;

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
  patchVariant: (id: string, v: Partial<Variant>) => void;
  removeVariant: (id: string) => void;
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

  importDB: (db: DB) => void;
  importDraft: (draft: Draft, mode: "replace" | "append") => { variantId: string; entries: number };
  resetDB: () => void;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      db: clone(SEED),
      hydrated: false,
      lang: "en",
      theme: "system",
      activeVariantId: SEED.variants[0].id,

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setActiveVariant: (activeVariantId) => set({ activeVariantId }),

      patchProfile: (p) => set((s) => ({ db: { ...s.db, profile: { ...s.db.profile, ...p } } })),

      addEntry: (e) => {
        const id = uid("e");
        set((s) => ({
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
        }));
        return id;
      },
      patchEntry: (id, e) =>
        set((s) => ({
          db: { ...s.db, entries: s.db.entries.map((x) => (x.id === id ? { ...x, ...e } : x)) },
        })),
      removeEntry: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.filter((x) => x.id !== id),
            variants: s.db.variants.map((v) => ({
              ...v,
              sections: v.sections.map((sec) => ({ ...sec, ids: sec.ids.filter((i) => i !== id) })),
            })),
          },
        })),

      addBullet: (entryId, text = "") => {
        const id = uid("b");
        set((s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.map((e) =>
              e.id === entryId ? { ...e, bullets: [...e.bullets, { id, text, tags: [] }] } : e
            ),
          },
        }));
        return id;
      },
      patchBullet: (entryId, bulletId, b) =>
        set((s) => ({
          db: {
            ...s.db,
            entries: s.db.entries.map((e) =>
              e.id === entryId
                ? { ...e, bullets: e.bullets.map((x) => (x.id === bulletId ? { ...x, ...b } : x)) }
                : e
            ),
          },
        })),
      removeBullet: (entryId, bulletId) =>
        set((s) => ({
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
        })),
      moveBullet: (entryId, bulletId, dir) =>
        set((s) => ({
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
        })),

      addSkill: (sk) => {
        const id = uid("sk");
        set((s) => ({
          db: {
            ...s.db,
            skills: [...s.db.skills, { id, label: "New group", items: "", tags: [], ...sk }],
          },
        }));
        return id;
      },
      patchSkill: (id, sk) =>
        set((s) => ({
          db: { ...s.db, skills: s.db.skills.map((x) => (x.id === id ? { ...x, ...sk } : x)) },
        })),
      removeSkill: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            skills: s.db.skills.filter((x) => x.id !== id),
            variants: s.db.variants.map((v) => ({
              ...v,
              sections: v.sections.map((sec) => ({ ...sec, ids: sec.ids.filter((i) => i !== id) })),
            })),
          },
        })),

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
        set((s) => ({ db: { ...s.db, variants: [...s.db.variants, v] }, activeVariantId: id }));
        return id;
      },
      patchVariant: (id, v) =>
        set((s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((x) => (x.id === id ? { ...x, ...v, updatedAt: stamp() } : x)),
          },
        })),
      removeVariant: (id) =>
        set((s) => {
          const variants = s.db.variants.filter((x) => x.id !== id);
          return {
            db: { ...s.db, variants },
            activeVariantId: s.activeVariantId === id ? variants[0]?.id ?? "" : s.activeVariantId,
          };
        }),
      toggleBulletInVariant: (variantId, bulletId) =>
        set((s) => ({
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
        })),
      setBulletsInVariant: (variantId, bulletIds, on) =>
        set((s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              if (v.id !== variantId) return v;
              const set2 = new Set(v.bulletIds);
              bulletIds.forEach((b) => (on ? set2.add(b) : set2.delete(b)));
              return { ...v, bulletIds: [...set2], updatedAt: stamp() };
            }),
          },
        })),
      toggleEntryInVariant: (variantId, sectionId, entryId) =>
        set((s) => ({
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
        })),
      setEntryInVariant: (variantId, entryId, on) =>
        set((s) => {
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
        }),
      setEntryEverywhere: (entryId, on) =>
        set((s) => {
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
        }),
      setSkillInVariant: (variantId, skillId, on) =>
        set((s) => ({
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
        })),
      setSkillEverywhere: (skillId, on) =>
        set((s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) => {
              const next = on
                ? addSkillToVariant(s.db, v, skillId)
                : removeFromVariant(v, skillId);
              return next === v ? v : { ...next, updatedAt: stamp() };
            }),
          },
        })),
      setBulletInVariant: (variantId, bulletId, on) =>
        set((s) => {
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
        }),
      moveEntryInVariant: (variantId, sectionId, entryId, dir) =>
        set((s) => ({
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
        })),
      addSectionToVariant: (variantId, title, type) =>
        set((s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? { ...v, sections: [...v.sections, { id: uid("s"), title, type, ids: [] }], updatedAt: stamp() }
                : v
            ),
          },
        })),
      patchSection: (variantId, sectionId, patch) =>
        set((s) => ({
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
        })),
      removeSection: (variantId, sectionId) =>
        set((s) => ({
          db: {
            ...s.db,
            variants: s.db.variants.map((v) =>
              v.id === variantId
                ? { ...v, sections: v.sections.filter((sec) => sec.id !== sectionId), updatedAt: stamp() }
                : v
            ),
          },
        })),
      moveSection: (variantId, sectionId, dir) =>
        set((s) => ({
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
        })),

      addApplication: (a) => {
        const id = uid("a");
        const status = a.status ?? "saved";
        set((s) => ({
          db: {
            ...s.db,
            applications: [
              {
                id,
                company: "",
                role: "",
                team: "",
                location: "",
                region: "US",
                variantId: s.activeVariantId,
                status,
                appliedAt: status === "saved" ? "" : today(),
                deadline: "",
                source: "",
                referral: "",
                jdUrl: "",
                portal: "",
                nextAction: "",
                nextActionAt: "",
                notes: "",
                prepTopics: [],
                events: [{ at: today(), status }],
                ...a,
              } as Application,
              ...s.db.applications,
            ],
          },
        }));
        return id;
      },
      patchApplication: (id, a) =>
        set((s) => ({
          db: {
            ...s.db,
            applications: s.db.applications.map((x) => {
              if (x.id !== id) return x;
              const next = { ...x, ...a };
              if (a.status && a.status !== x.status) {
                next.events = [...x.events, { at: today(), status: a.status }];
                if (a.status === "applied" && !next.appliedAt) next.appliedAt = today();
              }
              return next;
            }),
          },
        })),
      removeApplication: (id) =>
        set((s) => ({ db: { ...s.db, applications: s.db.applications.filter((x) => x.id !== id) } })),

      addPlatform: (p) => {
        const id = uid("p");
        set((s) => ({
          db: {
            ...s.db,
            platforms: [
              ...s.db.platforms,
              { id, name: "New platform", url: "", kind: "other", color: "s5", target: 0, ...p },
            ],
          },
        }));
        return id;
      },
      patchPlatform: (id, p) =>
        set((s) => ({
          db: { ...s.db, platforms: s.db.platforms.map((x) => (x.id === id ? { ...x, ...p } : x)) },
        })),
      removePlatform: (id) =>
        set((s) => ({
          db: {
            ...s.db,
            platforms: s.db.platforms.filter((x) => x.id !== id),
            problems: s.db.problems.filter((x) => x.platformId !== id),
          },
        })),

      addProblem: (p) => {
        const id = uid("q");
        set((s) => ({
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
        }));
        return id;
      },
      patchProblem: (id, p) =>
        set((s) => ({
          db: { ...s.db, problems: s.db.problems.map((x) => (x.id === id ? { ...x, ...p } : x)) },
        })),
      removeProblem: (id) =>
        set((s) => ({ db: { ...s.db, problems: s.db.problems.filter((x) => x.id !== id) } })),
      gradeProblem: (id, confidence) =>
        set((s) => ({
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
        })),

      importDB: (db) => set({ db, activeVariantId: db.variants[0]?.id ?? "" }),

      /** Turn a parsed .tex/.pdf draft into entries, skills and a variant that shows all of it. */
      importDraft: (draft, mode) => {
        const st = get();
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

        const suffix = mode === "append" ? `-${st.db.variants.length + 1}` : "";
        const variant: Variant = {
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

        // only touch profile fields the draft actually found; appending never clobbers
        const profile: Profile = { ...st.db.profile };
        (Object.keys(draft.profile) as (keyof Profile)[]).forEach((k) => {
          const v = draft.profile[k]?.trim();
          if (v && (mode === "replace" || !profile[k])) profile[k] = v;
        });

        set((s) => {
          const variants = mode === "replace" ? [variant] : [...s.db.variants, variant];
          const live = new Set(variants.map((v) => v.id));
          return {
            db: {
              ...s.db,
              profile,
              entries: mode === "replace" ? entries : [...s.db.entries, ...entries],
              skills: mode === "replace" ? skills : [...s.db.skills, ...skills],
              variants,
              // replace drops the old variants — keep applications pointing somewhere real
              applications: s.db.applications.map((a) =>
                live.has(a.variantId) ? a : { ...a, variantId: variant.id }
              ),
            },
            activeVariantId: variant.id,
          };
        });

        return { variantId: variant.id, entries: entries.length };
      },
      resetDB: () => set({ db: clone(SEED), activeVariantId: SEED.variants[0].id }),
    }),
    {
      name: "resume-forge",
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

export function useHydrated() {
  return useStore((s) => s.hydrated);
}

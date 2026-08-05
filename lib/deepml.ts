"use client";

/* ------------------------------------------------------------------ *
 * Deep-ML is four separate catalogues behind four separate endpoints,
 * and only the first one is called "problems":
 *
 *   /list-problems            ~1200 exercises      /problems/<id>
 *   /projects  + /projects/<id>  multi-step builds /projects/<pid>/step/<sid>
 *   /math-problems            ~30 maths drills     /math-problems/<id>
 *   /labs                     ~38 labs             /labs/<id>
 *
 * Syncing only the first is why a project step you were part-way through
 * could not be found. All four are pulled now. Project steps need one
 * extra request per project — the list endpoint stops at `total_steps`
 * and does not name them — so that stage is fanned out a few at a time.
 *
 * Their CORS allowlist names only deep-ml.com and localhost:3000 / :3001,
 * so the direct call works under `npm run dev` and is refused everywhere
 * else. Each request tries direct first, then /api/deepml, a read-only
 * passthrough in this app that covers every other host, deployment
 * included.
 *
 * What none of it gives: which items *you* have finished. That sits
 * behind Deep-ML's login, so ticking them off stays manual.
 *
 * The catalogue lives in its own localStorage key, deliberately outside
 * the zustand DB: it is refetchable public data, and folding it into
 * every JSON export would be wrong.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from "react";
import type { Platform, Problem } from "./types";

const SITE = "https://www.deep-ml.com";
const API = "https://api.deep-ml.com";
const PROXY = "/api/deepml";
const KEY = "rf.deepml.v2";

export type DeepMlKind = "problem" | "step" | "math" | "lab";

export interface CatalogItem {
  kind: DeepMlKind;
  /** what gets stored as the row's ref — unique across all four catalogues */
  ref: string;
  /** the narrow mono badge in the picker; `ref` is too long for steps */
  short: string;
  title: string;
  difficulty: Problem["difficulty"];
  category: string;
  url: string;
  /** the project a step belongs to */
  parent?: string;
  premium?: boolean;
}

interface Cache {
  at: string;
  items: CatalogItem[];
}

/** A platform is Deep-ML if its URL says so — no new field on the model. */
export const isDeepMl = (p?: Platform) => !!p && /(^|\/\/|\.)deep-ml\.com/.test(p.url);

/* --- module-level cache, shared by every mounted component --- */
let mem: Cache | null = null;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function read(): Cache | null {
  if (loaded) return mem;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as Cache;
      if (Array.isArray(c?.items)) mem = c;
    }
  } catch {
    /* a corrupt cache is just a cache miss */
  }
  return mem;
}

const DIFFS: Problem["difficulty"][] = ["easy", "medium", "hard"];
const diff = (v: unknown): Problem["difficulty"] =>
  (DIFFS as string[]).includes(String(v)) ? (String(v) as Problem["difficulty"]) : "";
const str = (v: unknown) => String(v ?? "").trim();

/* ------------------------------------------------------------------ *
 * fetching
 * ------------------------------------------------------------------ */

/** Straight to Deep-ML when its CORS allowlist lets us; our own origin otherwise. */
async function get(path: string, proxyQuery: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${API}${path}`, { headers: { accept: "application/json" } });
    if (res.ok) return res.json();
  } catch {
    /* blocked by CORS or offline — the proxy below is the answer to both */
  }
  const res = await fetch(`${PROXY}?${proxyQuery}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Deep-ML answered ${res.status}`);
  return res.json();
}

const rows = (json: Record<string, unknown>, key: string): Record<string, unknown>[] => {
  const v = json[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
};

/** Run `work` over `items` a few at a time — 34 project fetches, not 34 at once. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T, i: number) => Promise<R>,
  onTick?: (done: number) => void
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const runner = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i], i);
      onTick?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return out;
}

async function fetchProblems(): Promise<CatalogItem[]> {
  const json = await get("/list-problems", "r=problems");
  return rows(json, "problems")
    .map((r) => {
      const id = str(r.id);
      return {
        kind: "problem" as const,
        ref: id,
        short: id,
        title: str(r.title),
        difficulty: diff(r.difficulty),
        category: str(r.category),
        url: `${SITE}/problems/${id}`,
      };
    })
    .filter((x) => x.ref && x.title);
}

async function fetchMath(): Promise<CatalogItem[]> {
  const json = await get("/math-problems", "r=math");
  return rows(json, "items")
    .map((r) => {
      const id = str(r.id);
      return {
        kind: "math" as const,
        ref: `M${id}`,
        short: `M${id}`,
        title: str(r.title),
        difficulty: diff(r.difficulty),
        category: str(r.topic) || "Maths",
        url: `${SITE}/math-problems/${id}`,
      };
    })
    .filter((x) => x.title);
}

async function fetchLabs(): Promise<CatalogItem[]> {
  const json = await get("/labs", "r=labs");
  return rows(json, "items")
    .map((r) => {
      const id = str(r.id);
      return {
        kind: "lab" as const,
        ref: `L${id}`,
        short: `L${id}`,
        title: str(r.title),
        difficulty: diff(r.difficulty),
        category: str(r.category) || "Lab",
        url: `${SITE}/labs/${id}`,
      };
    })
    .filter((x) => x.title);
}

/** The list endpoint counts steps but does not name them — one call per project. */
async function fetchProjectSteps(onTick: (done: number, total: number) => void): Promise<CatalogItem[]> {
  const list = rows(await get("/projects", "r=projects"), "items");
  const projects = list.map((p) => ({
    id: str(p.id),
    title: str(p.title),
    difficulty: diff(p.difficulty),
    category: str(p.category),
    premium: p.premium === true,
  }));
  const total = projects.length;
  onTick(0, total);

  const perProject = await mapLimit(
    projects.filter((p) => p.id),
    5,
    async (p): Promise<CatalogItem[]> => {
      let steps: Record<string, unknown>[] = [];
      try {
        steps = rows(await get(`/projects/${p.id}`, `r=project&id=${encodeURIComponent(p.id)}`), "steps");
      } catch {
        /* one unreachable project should not sink the whole sync */
        return [];
      }
      return steps
        .map((s) => {
          const sid = str(s.id);
          const order = Number(s.order) || 0;
          return {
            kind: "step" as const,
            ref: sid,
            short: order ? `·${String(order).padStart(2, "0")}` : "·",
            title: str(s.title),
            difficulty: p.difficulty,
            category: p.category,
            url: `${SITE}/projects/${p.id}/step/${sid}`,
            parent: p.title,
            premium: p.premium,
          };
        })
        .filter((x) => x.ref && x.title);
    },
    (done) => onTick(done, total)
  );
  return perProject.flat();
}

export async function syncCatalog(onProgress?: (msg: string) => void): Promise<number> {
  const say = (m: string) => onProgress?.(m);

  say("problems…");
  const [problems, math, labs] = await Promise.all([fetchProblems(), fetchMath(), fetchLabs()]);

  const steps = await fetchProjectSteps((done, total) => say(`projects ${done}/${total}`));

  const items = [...problems, ...steps, ...math, ...labs];
  if (!items.length) throw new Error("Deep-ML returned an empty catalogue");

  mem = { at: new Date().toISOString(), items };
  loaded = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* over quota — the in-memory copy still serves this session */
  }
  emit();
  return items.length;
}

/* ------------------------------------------------------------------ *
 * lookup
 * ------------------------------------------------------------------ */

/** Exact ref lookup — what a bare id in the bulk-paste box needs. */
export function byRef(items: CatalogItem[], ref: string): CatalogItem | undefined {
  const k = ref.trim();
  return k ? items.find((x) => x.ref === k) : undefined;
}

/**
 * A pasted Deep-ML link resolves to the thing it points at. This is the
 * shortest path from "the tab I have open" to "logged", and it covers the
 * shapes the four catalogues use.
 */
export function refFromUrl(input: string): string | null {
  const raw = input.trim();
  if (!/deep-ml\.com/i.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg[0] === "problems" && seg[1]) return seg[1];
  if (seg[0] === "projects" && seg[2] === "step" && seg[3]) return seg[3];
  if (seg[0] === "math-problems" && seg[1]) return `M${seg[1]}`;
  if (seg[0] === "labs" && seg[1]) return `L${seg[1]}`;
  return null;
}

/** Exact ref first, then ref prefix, then title, then the project name. */
export function search(items: CatalogItem[], q: string, limit = 8): CatalogItem[] {
  const raw = q.trim();
  if (!raw) return [];

  /* a pasted link is unambiguous — answer with exactly that one thing */
  const fromUrl = refFromUrl(raw);
  if (fromUrl) {
    const hit = byRef(items, fromUrl);
    return hit ? [hit] : [];
  }

  const s = raw.toLowerCase();
  const exact: CatalogItem[] = [];
  const refPre: CatalogItem[] = [];
  const starts: CatalogItem[] = [];
  const has: CatalogItem[] = [];
  for (const x of items) {
    const ref = x.ref.toLowerCase();
    const t = x.title.toLowerCase();
    if (ref === s) exact.push(x);
    else if (ref.startsWith(s)) refPre.push(x);
    else if (t.startsWith(s)) starts.push(x);
    else if (t.includes(s) || x.parent?.toLowerCase().includes(s)) has.push(x);
    if (exact.length + refPre.length + starts.length + has.length > limit * 6) break;
  }
  return [...exact, ...refPre, ...starts, ...has].slice(0, limit);
}

/** A catalogue row, shaped for `addProblem`. */
export const toProblem = (x: CatalogItem, platformId: string): Partial<Problem> => ({
  platformId,
  ref: x.ref,
  title: x.parent && x.kind === "step" ? `${x.parent} · ${x.title}` : x.title,
  url: x.url,
  difficulty: x.difficulty,
  topics: x.category ? [x.category] : [],
});

export type SyncState = "idle" | "loading" | "error";

export function useDeepMlCatalog() {
  const [, bump] = useState(0);
  const [state, setState] = useState<SyncState>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [cache, setCache] = useState<Cache | null>(null);

  useEffect(() => {
    const onChange = () => {
      setCache(mem);
      bump((n) => n + 1);
    };
    subs.add(onChange);
    setCache(read());
    return () => {
      subs.delete(onChange);
    };
  }, []);

  const sync = useCallback(async () => {
    setState("loading");
    setError("");
    setProgress("");
    try {
      await syncCatalog(setProgress);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync failed");
      setState("error");
    } finally {
      setProgress("");
    }
  }, []);

  return {
    items: cache?.items ?? [],
    syncedAt: cache?.at ?? "",
    state,
    error,
    progress,
    sync,
  };
}

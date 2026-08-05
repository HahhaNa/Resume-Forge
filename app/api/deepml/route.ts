import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ *
 * Deep-ML's catalogue endpoints are public, but its CORS allowlist only
 * names its own origins plus localhost:3000 / :3001 — so the browser can
 * call them directly from `npm run dev` and from nowhere else. This route
 * is the fallback for every other case, deployment included.
 *
 * It is the whole server side of this app: a read-only GET passthrough to
 * a fixed set of upstream paths. `r` selects one of them by name and is
 * never used to build a path directly; the project id is the only caller
 * input that reaches the URL, and it is pattern-checked first. No key, no
 * storage, no request body — nothing about you is sent, nothing is kept.
 * ------------------------------------------------------------------ */

const API = "https://api.deep-ml.com";

const PATHS: Record<string, string> = {
  problems: "/list-problems",
  math: "/math-problems",
  labs: "/labs",
  projects: "/projects",
};

/** Deep-ML project ids are lowercase slugs — anything else is not one. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** The catalogue changes when Deep-ML adds content, so an hour is plenty. */
export const revalidate = 3600;

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const r = params.get("r") ?? "problems";

  let path: string;
  if (r === "project") {
    const id = params.get("id") ?? "";
    if (!SLUG.test(id)) {
      return NextResponse.json({ error: "bad project id" }, { status: 400 });
    }
    path = `/projects/${id}`;
  } else if (PATHS[r]) {
    path = PATHS[r];
  } else {
    return NextResponse.json({ error: "unknown resource" }, { status: 400 });
  }

  try {
    const res = await fetch(`${API}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Deep-ML answered ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json(), {
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Deep-ML unreachable" }, { status: 502 });
  }
}

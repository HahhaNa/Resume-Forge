import { NextResponse } from "next/server";
import { MAX_BYTES, MAX_HOPS, readable, target } from "@/lib/jd";

/* ------------------------------------------------------------------ *
 * Fetching one job posting, on behalf of a browser that cannot.
 *
 * A job board will not serve its page to another origin, so reading a
 * posting from a link has to happen server-side. That makes this the
 * second piece of server code in the app and the first that takes a URL
 * from a user, which is the dangerous shape: a route that fetches
 * whatever it is handed will happily read a cloud metadata endpoint and
 * hand the credentials back in a response body.
 *
 * Four things keep it narrow, and the first is the one doing the work:
 *
 *   1. `target()` allowlists the host. Not a private-range denylist —
 *      those get written around. A named list of ATS hosts cannot be.
 *   2. Redirects are followed by hand, `MAX_HOPS` of them, and every hop
 *      is re-checked. A 302 off the allowlist is where an allowlist that
 *      only checks the first URL stops being one.
 *   3. The body is read as a stream and abandoned at `MAX_BYTES`, so a
 *      response that never ends is not a bill.
 *   4. Only HTML comes back as text, and only text goes out. No headers,
 *      no cookies, no status detail from the upstream.
 *
 * Nothing is stored and nothing about the user is sent — no cookies, no
 * referrer, no key. What comes back is untrusted in exactly the way a
 * pasted posting is untrusted, and goes through `sanitise` on arrival
 * like every other one.
 * ------------------------------------------------------------------ */

const TIMEOUT_MS = 10_000;

/** A plain identification. Pretending to be Chrome to get past a block would be
 *  choosing to argue with a site that has said no. */
const UA = "ResumeForge/1.0 (+https://github.com/HahhaNa/Resume-Forge)";

const fail = (reason: string, status: number) => NextResponse.json({ reason }, { status });

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  const t = target(raw);
  if ("refusal" in t) return fail(t.refusal, 400);

  let url = t.url;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);

  try {
    let res: Response | null = null;

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      res = await fetch(url, {
        redirect: "manual",
        signal: control.signal,
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": UA },
      });

      if (res.status < 300 || res.status >= 400) break;

      const next = res.headers.get("location");
      if (!next) break;
      /* every hop is re-checked: an allowlist that only reads the first URL is
         a suggestion, and a 302 is how you get past a suggestion */
      const hopped = target(new URL(next, url).toString());
      if ("refusal" in hopped) return fail("not-allowed", 400);
      url = hopped.url;
      res = null;
    }

    if (!res) return fail("blocked", 502);
    /* 403 and 429 are a site saying no, which is different from being down */
    if (res.status === 403 || res.status === 429) return fail("blocked", 502);
    if (!res.ok) return fail("unreachable", 502);

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return fail("blocked", 502);

    const html = await readCapped(res);
    const text = readable(html);
    if (!text.trim()) return fail("empty", 502);

    return NextResponse.json(
      { text, from: url.hostname },
      /* the advert changes when they edit it, and a stale one is worse than a
         slow one — this is a user action, not a catalogue */
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return fail("unreachable", 502);
  } finally {
    clearTimeout(timer);
  }
}

/** The body, up to `MAX_BYTES`, then abandoned. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    size += value.byteLength;
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, Math.min(c.byteLength, size - at)), at);
    at += c.byteLength;
    if (at >= size) break;
  }
  return new TextDecoder("utf-8").decode(all);
}

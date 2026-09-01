/* ------------------------------------------------------------------ *
 * Reading a posting off a link.
 *
 * This is the second server-side thing in the app, and the first one
 * that takes a URL from the user, so it is worth stating what it must
 * not become. A route that fetches whatever it is handed is a textbook
 * SSRF: point it at a cloud metadata address and it reads credentials
 * back to you, in a response body, from inside the deployment.
 *
 * The defence is an **allowlist**, not a denylist. Blocking private
 * ranges means enumerating every way an address can be written, and
 * that list has been got wrong by better projects than this. Naming the
 * two dozen hosts a job posting actually lives on is a rule anyone can
 * read and nobody can write around.
 *
 * The aggregators are deliberately **not** on it. LinkedIn, Indeed,
 * Glassdoor, 104 and the rest render their postings with JavaScript and
 * block server-side requests on purpose; allowing them would trade a
 * clear "paste it instead" for a login wall parsed as a job advert.
 * Where the fetch cannot work, saying so beats half-working.
 *
 * Nothing here is stored and nothing about the user is sent. The
 * posting comes back as text and goes through `sanitise` on arrival
 * like every other posting — a fetched advert is exactly as untrusted
 * as a pasted one, and arriving over a proxy does not clean it.
 * ------------------------------------------------------------------ */

/**
 * Hosts a posting can be fetched from.
 *
 * Applicant tracking systems only: these serve the advert as HTML to anyone
 * who asks, which is the whole reason they can be read at all.
 */
export const ALLOWED: RegExp[] = [
  /^(boards|job-boards)\.greenhouse\.io$/,
  /^boards\.eu\.greenhouse\.io$/,
  /^jobs\.lever\.co$/,
  /^jobs\.ashbyhq\.com$/,
  /^[a-z0-9-]+\.ashbyhq\.com$/,
  /^apply\.workable\.com$/,
  /^[a-z0-9-]+\.workable\.com$/,
  /^jobs\.smartrecruiters\.com$/,
  /^jobs\.jobvite\.com$/,
  /^ats\.rippling\.com$/,
  /^[a-z0-9-]+\.recruitee\.com$/,
  /^[a-z0-9-]+\.breezy\.hr$/,
  /^[a-z0-9-]+\.applytojob\.com$/,
  /^[a-z0-9-]+\.teamtailor\.com$/,
  /^[a-z0-9-]+\.pinpointhq\.com$/,
  /^[a-z0-9-]+\.bamboohr\.com$/,
];

/** Why a URL cannot be fetched, in a form the UI can turn into a sentence. */
export type Refusal = "not-a-url" | "not-https" | "not-allowed";

/**
 * Everything that can stop a fetch, including what only the server finds out.
 *
 * `redirected` is its own reason because it is a different situation with
 * different advice, and folding it into `not-allowed` produces a message that
 * is simply untrue. A Greenhouse link is on the list; a company that has moved
 * its board to its own careers site sends you off it on the second hop, and
 * telling that user "Greenhouse cannot be read" is wrong about the one fact
 * they can check.
 */
export type Reason = Refusal | "redirected" | "unreachable" | "blocked" | "empty";

/**
 * The URL to fetch, or the reason there is not one.
 *
 * Parsing is the check: a string that `URL` will not take is not a URL, and one
 * whose host is not on the list above is not fetched however it is spelled.
 */
export function target(raw: string): { url: URL } | { refusal: Refusal } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { refusal: "not-a-url" };
  }
  if (u.protocol !== "https:") return { refusal: "not-https" };
  const host = u.hostname.toLowerCase();
  if (!ALLOWED.some((re) => re.test(host))) return { refusal: "not-allowed" };
  return { url: u };
}

/** Enough for any advert ever written; a cap so a bad response cannot be a bill. */
export const MAX_BYTES = 800_000;

/** Redirects are followed by hand so every hop is checked, not just the first. */
export const MAX_HOPS = 3;

/**
 * The readable text of a job posting page.
 *
 * Not a readability implementation and not trying to be. Adverts are prose in
 * a `<div>`, and what actually ruins the extraction is script and style content
 * arriving as text — so those come out first, block tags become line breaks so
 * bullet lists survive, and the rest is stripped. What is left is over-inclusive
 * (navigation, the cookie banner) and that is the right way to be wrong here:
 * `read` in the agent is looking for requirements and ignores the rest, whereas
 * a clever extractor that drops the requirements list has lost the only part
 * that mattered.
 */
export function readable(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * the client half
 * ------------------------------------------------------------------ */

export interface Fetched {
  text: string;
  /** the host it came from, for saying where it went */
  from: string;
}

export class JdError extends Error {
  constructor(readonly reason: Reason) {
    super(reason);
  }
}

/**
 * Ask the proxy for a posting.
 *
 * The refusals are checked here as well as on the route, so a URL that cannot
 * work says so before a request is made rather than after a round trip.
 */
export async function fetchJd(raw: string): Promise<Fetched> {
  const t = target(raw);
  if ("refusal" in t) throw new JdError(t.refusal);

  const res = await fetch(`/api/jd?u=${encodeURIComponent(t.url.toString())}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    throw new JdError((body.reason as Reason) ?? "unreachable");
  }
  const body = (await res.json()) as Fetched;
  if (!body.text?.trim()) throw new JdError("empty");
  return body;
}

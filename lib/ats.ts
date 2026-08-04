/* ------------------------------------------------------------------ *
 * Job-board URLs carry the company in the path or the subdomain, so the
 * company name can be read straight off the link you already pasted —
 * no fetch, no CORS, no key, and it fires the instant you paste.
 *
 * A recognised ATS also tells you which portal you will be applying
 * through; an aggregator tells you where the posting came from. Anything
 * unrecognised falls back to the registrable domain, which is right more
 * often than it is wrong.
 * ------------------------------------------------------------------ */

export interface JdGuess {
  company: string;
  /** the ATS you apply through — non-empty means the host was recognised */
  portal: string;
  /** where the posting was found, when the URL says so */
  source: string;
  role: string;
}

/** Subdomain labels that name a function, not a company. */
const STOP = new Set([
  "www", "jobs", "job", "careers", "career", "apply", "boards", "board",
  "hiring", "join", "talent", "recruiting", "recruit", "work", "my", "en", "us",
]);

/** Second-level labels that are part of the public suffix, not the name. */
const SUFFIX = new Set(["co", "com", "org", "net", "ac", "edu", "gov"]);

const UUIDISH = /^[0-9a-f]{8}-|^[0-9a-f]{16,}$|^\d+$|^[A-Z0-9]{6,}$/i;

/** Title case turns "ml" into "Ml"; these read as themselves or not at all. */
const ACRONYMS = new Set([
  "ai", "ml", "nlp", "cv", "llm", "gpu", "cpu", "api", "ui", "ux", "ios",
  "sre", "qa", "hpc", "asic", "rtl", "fpga", "vlsi", "dsp", "sql", "ci", "cd",
]);

/** "acme-labs" / "acme_labs" / "acmeLabs" -> "Acme Labs" */
function pretty(raw: string): string {
  const s = decodeURIComponent(raw)
    .replace(/[-_+]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s
    .split(" ")
    .map((w) => {
      if (/^[A-Z0-9]{2,}$/.test(w)) return w;
      if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** The company's own label in `careers.acme.com`, `acme.com`, `jobs.acme.co.uk`. */
function fromDomain(host: string): string {
  const parts = host.split(".");
  let i = parts.length - 2;
  if (parts.length >= 3 && SUFFIX.has(parts[parts.length - 2])) i = parts.length - 3;
  let name = parts[i] ?? "";
  while (STOP.has(name) && i > 0) name = parts[--i];
  return STOP.has(name) ? "" : name;
}

/**
 * A trailing slug often *is* the job title — `…/jobs/senior-ml-engineer`.
 * Only trust it when it reads like words: two or more alpha chunks, no
 * uuid, no bare id, and short enough to be a title rather than a sentence.
 */
function roleFromPath(seg: string[]): string {
  for (let i = seg.length - 1; i >= 0 && i >= seg.length - 2; i--) {
    const raw = seg[i].replace(/-\d{4,}$/, "").replace(/-[0-9a-f]{8,}$/i, "");
    if (UUIDISH.test(raw) || raw.length < 6 || raw.length > 64) continue;
    const words = raw.split(/[-_]/).filter((w) => /^[a-zA-Z]{2,}$/.test(w));
    if (words.length >= 2 && words.length <= 8) return pretty(words.join("-"));
  }
  return "";
}

const NONE: JdGuess = { company: "", portal: "", source: "", role: "" };

/** Returns null only when the input is not a URL at all. */
export function parseJdUrl(input: string): JdGuess | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!u.hostname.includes(".")) return null;

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const seg = u.pathname.split("/").filter(Boolean);
  const role = roleFromPath(seg);
  const at = (company: string, portal: string, source = ""): JdGuess => ({
    company: pretty(company),
    portal,
    source,
    role,
  });

  /* --- aggregators: no company in the URL, but the source is worth keeping --- */
  if (/(^|\.)linkedin\.com$/.test(host)) return { ...NONE, source: "LinkedIn", role };
  if (/(^|\.)indeed\.(com|[a-z.]+)$/.test(host)) return { ...NONE, source: "Indeed", role };
  if (/(^|\.)glassdoor\.[a-z.]+$/.test(host)) return { ...NONE, source: "Glassdoor", role };
  if (/(^|\.)simplify\.jobs$/.test(host)) return { ...NONE, source: "Simplify", role };
  if (/(^|\.)(wellfound\.com|angel\.co)$/.test(host)) return { ...NONE, source: "Wellfound", role };
  if (/(^|\.)handshake\.com$/.test(host) || /(^|\.)joinhandshake\.com$/.test(host))
    return { ...NONE, source: "Handshake", role };
  if (/(^|\.)104\.com\.tw$/.test(host)) return { ...NONE, source: "104", role };
  if (/(^|\.)1111\.com\.tw$/.test(host)) return { ...NONE, source: "1111", role };
  if (/(^|\.)yourator\.co$/.test(host)) return { ...NONE, source: "Yourator", role };
  if (/(^|\.)cake\.me$/.test(host))
    return seg[0] === "companies" && seg[1]
      ? at(seg[1], "", "Cake")
      : { ...NONE, source: "Cake", role };

  /* --- ATS that put the company first in the path --- */
  if (/(^|\.)greenhouse\.io$/.test(host) && seg[0]) return at(seg[0], "Greenhouse");
  if (/(^|\.)lever\.co$/.test(host) && seg[0]) return at(seg[0], "Lever");
  if (host === "jobs.ashbyhq.com" && seg[0]) return at(seg[0], "Ashby");
  if (host === "apply.workable.com" && seg[0]) return at(seg[0], "Workable");
  if (host === "jobs.smartrecruiters.com" && seg[0]) return at(seg[0], "SmartRecruiters");
  if (host === "jobs.jobvite.com" && seg[0]) return at(seg[0], "Jobvite");
  if (host === "ats.rippling.com" && seg[0]) return at(seg[0], "Rippling");
  if (host === "boards.eu.greenhouse.io" && seg[0]) return at(seg[0], "Greenhouse");

  /* --- ATS that put the company in the subdomain --- */
  const sub = host.split(".")[0].replace(/^careers?-?/, "");
  if (/\.myworkdayjobs\.com$/.test(host)) return at(sub, "Workday");
  if (/\.wd\d+\.myworkdaysite\.com$/.test(host)) return at(sub, "Workday");
  if (/\.ashbyhq\.com$/.test(host)) return at(sub, "Ashby");
  if (/\.workable\.com$/.test(host)) return at(sub, "Workable");
  if (/\.taleo\.net$/.test(host)) return at(sub, "Taleo");
  if (/\.icims\.com$/.test(host)) return at(sub, "iCIMS");
  if (/\.bamboohr\.com$/.test(host)) return at(sub, "BambooHR");
  if (/\.recruitee\.com$/.test(host)) return at(sub, "Recruitee");
  if (/\.breezy\.hr$/.test(host)) return at(sub, "Breezy");
  if (/\.applytojob\.com$/.test(host)) return at(sub, "JazzHR");
  if (/\.pinpointhq\.com$/.test(host)) return at(sub, "Pinpoint");
  if (/\.teamtailor\.com$/.test(host)) return at(sub, "Teamtailor");

  /* --- the company's own careers page --- */
  return at(fromDomain(host), "", "");
}

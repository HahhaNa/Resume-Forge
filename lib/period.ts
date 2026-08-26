/* ------------------------------------------------------------------ *
 * A period, as parts rather than as a sentence.
 *
 * An entry stores its dates as the text that goes on the page — "Sep 2026 --
 * Jun 2028 (expected)" — because that is what both the .tex and the preview
 * need. Typed by hand it drifts: "Sept" on one entry and "September" on the
 * next, "09/2025" further down, a hyphen where the one above has a dash. Every
 * date on a résumé is read as a column even when it is not one, so the drift
 * is visible, and it reads as carelessness.
 *
 * So the editor offers the parts and this module is the only thing that writes
 * the string. Parsing is the same map backwards: what is already stored — typed
 * here before, or carried in from an imported PDF — has to come back apart into
 * the parts, or the picker would silently overwrite it.
 * ------------------------------------------------------------------ */

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Internships and exchanges are dated by term at least as often as by month. */
export const SEASONS = ["Spring", "Summer", "Fall", "Winter"] as const;

export const TERMS: readonly string[] = [...MONTHS, ...SEASONS];

export interface Period {
  /** Blank means the year on its own, which is how awards and one-off projects are dated. */
  startTerm: string;
  startYear: string;
  endTerm: string;
  endYear: string;
  /** Still going: renders as "Present", and the end term and year go unused. */
  present: boolean;
  /** A graduation that has not happened yet — " (expected)". */
  expected: boolean;
}

export const EMPTY_PERIOD: Period = {
  startTerm: "",
  startYear: "",
  endTerm: "",
  endYear: "",
  present: false,
  expected: false,
};

/** What pdflatex and `display()` both turn into an en dash. */
const RANGE = "--";
const PRESENT = "Present";

/* What a stored string is allowed to have been written as. The picker only ever
 * emits the short forms, but a period that came in from an import did not. */
const ALIAS: Record<string, string> = {
  january: "Jan", february: "Feb", march: "Mar", april: "Apr", june: "Jun",
  july: "Jul", august: "Aug", september: "Sep", sept: "Sep", october: "Oct",
  november: "Nov", december: "Dec", autumn: "Fall",
};
for (const term of TERMS) ALIAS[term.toLowerCase()] = term;

const STILL_GOING = new Set(["present", "now", "current", "ongoing", "today"]);

const side = (term: string, year: string) => (year ? (term ? `${term} ${year}` : year) : "");

/** The one place a period becomes text. */
export function formatPeriod(p: Period): string {
  const start = side(p.startTerm, p.startYear);
  const end = p.present ? PRESENT : side(p.endTerm, p.endYear);
  const core = start && end ? `${start} ${RANGE} ${end}` : start || end;
  return core && p.expected ? `${core} (expected)` : core;
}

function parseSide(s: string): { term: string; year: string } | null {
  const m = /^(?:([A-Za-z]{3,9})\.?[\s.]+)?((?:19|20)\d{2})$/.exec(s.trim());
  if (!m) return null;
  if (!m[1]) return { term: "", year: m[2] };
  const term = ALIAS[m[1].toLowerCase()];
  return term ? { term, year: m[2] } : null;
}

/**
 * The parts behind a stored period, or `null` for anything the picker cannot
 * say — "Summer 2022 & 2023", a note in brackets, a date that was never a date.
 * `null` is not a failure: it is the signal to leave the text alone and let it
 * be edited as text, because rounding it to the nearest pair of dropdowns would
 * throw away what the user actually wrote.
 */
export function parsePeriod(text: string): Period | null {
  const raw = text.trim();
  if (!raw) return { ...EMPTY_PERIOD };

  let expected = false;
  const body = raw
    .replace(/\s*\(\s*expected\s*\)\s*$/i, () => ((expected = true), ""))
    .replace(/\s+expected\s*$/i, () => ((expected = true), ""))
    .trim();

  const parts = body.split(/\s*(?:-{1,3}|–|—|\bto\b)\s*/).filter((p) => p !== "");
  if (parts.length === 0 || parts.length > 2) return null;

  const start = parseSide(parts[0]);
  if (!start) return null;
  if (parts.length === 1) {
    return { ...EMPTY_PERIOD, startTerm: start.term, startYear: start.year, expected };
  }

  const tail = parts[1].toLowerCase().replace(/\.$/, "");
  if (STILL_GOING.has(tail)) {
    return { ...EMPTY_PERIOD, startTerm: start.term, startYear: start.year, present: true, expected };
  }
  const end = parseSide(parts[1]);
  if (!end) return null;
  return {
    startTerm: start.term,
    startYear: start.year,
    endTerm: end.term,
    endYear: end.year,
    present: false,
    expected,
  };
}

/** Far enough ahead for a degree still in progress, far enough back for a first one. */
const AHEAD = 6;
const BACK = 40;

/**
 * The years the picker offers, nearest first. Anything already stored is kept in
 * the list however old it is, so opening an entry can never quietly drop its year.
 */
export function yearOptions(...keep: string[]): string[] {
  const now = new Date().getFullYear();
  const years = new Set<string>();
  for (let y = now + AHEAD; y >= now - BACK; y--) years.add(String(y));
  for (const k of keep) if (/^\d{4}$/.test(k)) years.add(k);
  return [...years].sort((a, b) => Number(b) - Number(a));
}

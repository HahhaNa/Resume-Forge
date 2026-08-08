/**
 * Bring an existing résumé in from a .tex or .pdf file so a new user can start
 * from what they already have instead of an empty library.
 *
 * Both paths converge on the same `Draft` shape, which the UI previews and the
 * store turns into entries / skills / a first variant.
 */
import type { EntryKind, Profile } from "./types";

export interface DraftEntry {
  kind: EntryKind;
  org: string;
  title: string;
  location: string;
  period: string;
  bullets: string[];
}

export interface DraftSection {
  title: string;
  type: "entries" | "skills";
  entries: DraftEntry[];
  skills: { label: string; items: string }[];
}

export interface Draft {
  source: "tex" | "pdf" | "text";
  profile: Partial<Profile>;
  sections: DraftSection[];
  /** i18n keys, translated at render time */
  warnings: string[];
}

/* ---------------- shared vocabulary ---------------- */

const SECTION_KIND: [RegExp, EntryKind][] = [
  [/educat|學歷|degree/i, "education"],
  [/experien|employment|work|intern|research|職涯|經歷|實習/i, "experience"],
  [/project|作品|專題/i, "project"],
  [/award|honor|achievement|scholarship|獎/i, "award"],
  [/activit|leadership|volunteer|extracurricular|service|社團|活動/i, "activity"],
];

export const kindForSection = (title: string): EntryKind => {
  for (const [re, kind] of SECTION_KIND) if (re.test(title)) return kind;
  return "experience";
};

const SKILLS_RE = /skill|tool|technolog|language|framework|competenc|技能|工具|語言/i;
export const isSkillsSection = (title: string) => SKILLS_RE.test(title);

const KNOWN_SECTIONS =
  /^(education|academic background|experience|work experience|professional experience|research experience|industry experience|employment|internships?|projects?|selected projects|personal projects|technical skills|skills|skills? (&|and) (tools|interests)|awards?|honors?|awards? (&|and) honors?|publications?|activities|leadership|volunteering|certifications?|coursework|relevant coursework|summary|profile|objective|interests|extracurriculars?|references)$/i;

// deliberately strict: a bare "Aug" must not make "Augusta, GA" look like a date
const DATE_RE =
  /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(19|20)\d{2}\b|\b(present|current|ongoing|expected|now)\b/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+\w/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.-]+\/?/i;
const PHONE_RE = /(\(?\+?\d[\d\s().+-]{6,}\d)/;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function profileFromText(text: string, into: Partial<Profile>) {
  const email = text.match(EMAIL_RE)?.[0];
  if (email && !into.email) into.email = email;
  const li = text.match(LINKEDIN_RE)?.[0];
  if (li && !into.linkedin) into.linkedin = li.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const gh = text.match(GITHUB_RE)?.[0];
  if (gh && !into.github) into.github = gh.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // strip the things that look like phones but aren't, e.g. a date range
  const phoneLine = text
    .split(/[|·•\n]/)
    .map((x) => x.trim())
    .find((x) => PHONE_RE.test(x) && !EMAIL_RE.test(x) && !/\.(com|io|dev|org|net)/i.test(x));
  const phone = phoneLine?.match(PHONE_RE)?.[0];
  if (phone && !into.phone) into.phone = clean(phone);
}

/* =====================================================================
 *  LaTeX
 * ===================================================================== */

/** Drop `% comments` but keep escaped `\%`. */
function stripComments(src: string) {
  return src
    .split("\n")
    .map((line) => {
      let out = "";
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%" && line[i - 1] !== "\\") break;
        out += line[i];
      }
      return out;
    })
    .join("\n");
}

/** Read `n` consecutive `{...}` groups starting at/after `i`. Returns the raw bodies. */
function readArgs(src: string, i: number, n: number): { args: string[]; end: number } {
  const args: string[] = [];
  let p = i;
  for (let a = 0; a < n; a++) {
    while (p < src.length && /\s/.test(src[p])) p++;
    if (src[p] === "[") {
      // optional argument — skip it and try again
      let d = 1;
      p++;
      while (p < src.length && d > 0) {
        if (src[p] === "[") d++;
        else if (src[p] === "]") d--;
        p++;
      }
      a--;
      continue;
    }
    if (src[p] !== "{") break;
    let depth = 1;
    let body = "";
    p++;
    while (p < src.length && depth > 0) {
      const c = src[p];
      if (c === "\\") {
        body += c + (src[p + 1] ?? "");
        p += 2;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          p++;
          break;
        }
      }
      body += c;
      p++;
    }
    args.push(body);
  }
  return { args, end: p };
}

/** `~` is a non-breaking space in LaTeX, so `$\sim$` rides through the scanner disguised. */
const SIM = "";

const MATH_TEXT: [RegExp, string][] = [
  [/\$\\sim\$/g, SIM],
  [/\$\\times\$/g, "×"],
  [/\$\\geq\$/g, "≥"],
  [/\$\\leq\$/g, "≤"],
  [/\$\\rightarrow\$/g, "→"],
  [/\$\\cdot\$/g, "·"],
  [/\$\\bullet\$/g, "•"],
  [/\$\|\$/g, "|"],
  [/\$-\$/g, "-"],
];

/** Commands whose sole `{...}` argument is content we want to keep verbatim. */
const PASSTHROUGH = new Set([
  "textit",
  "emph",
  "textrm",
  "texttt",
  "textsc",
  "underline",
  "mbox",
  "text",
  "small",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
  "footnotesize",
  "scriptsize",
  "normalsize",
]);

/** Commands we drop along with their arguments. */
const DROP_WITH_ARG: Record<string, number> = {
  vspace: 1,
  hspace: 1,
  label: 1,
  hypersetup: 1,
  color: 1,
  textcolor: 2,
  raisebox: 1,
  scalebox: 1,
  includegraphics: 1,
  faIcon: 1,
};

/** LaTeX fragment → plain text, keeping `\textbf{}` as the app's `**bold**`. */
export function unTex(src: string): string {
  let s = src;
  for (const [re, rep] of MATH_TEXT) s = s.replace(re, rep);

  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== "\\") {
      if (c === "{" || c === "}") {
        i++;
        continue;
      }
      if (c === "~") {
        out += " ";
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    // escaped literal
    if (/[&%$#_{}]/.test(s[i + 1] ?? "")) {
      out += s[i + 1];
      i += 2;
      continue;
    }
    if (s[i + 1] === "\\") {
      out += " ";
      i += 2;
      continue;
    }
    const m = /^\\([a-zA-Z]+)\*?/.exec(s.slice(i));
    if (!m) {
      i++;
      continue;
    }
    const name = m[1];
    let p = i + m[0].length;

    if (name === "textbackslash") {
      out += "\\";
      const r = readArgs(s, p, 1);
      i = r.args.length ? r.end : p;
      continue;
    }
    if (name === "href") {
      const { args, end } = readArgs(s, p, 2);
      out += unTex(args[1] ?? args[0] ?? "");
      i = end;
      continue;
    }
    if (name === "url") {
      const { args, end } = readArgs(s, p, 1);
      out += args[0] ?? "";
      i = end;
      continue;
    }
    if (name === "textbf") {
      const { args, end } = readArgs(s, p, 1);
      const inner = clean(unTex(args[0] ?? ""));
      out += inner ? `**${inner}**` : "";
      i = end;
      continue;
    }
    if (PASSTHROUGH.has(name)) {
      const { args, end } = readArgs(s, p, 1);
      if (args.length) {
        out += unTex(args[0]);
        i = end;
      } else {
        i = p; // a bare switch like `\small` — just drop the command
      }
      continue;
    }
    if (name in DROP_WITH_ARG) {
      const { end } = readArgs(s, p, DROP_WITH_ARG[name]);
      i = end;
      continue;
    }
    // unknown command: drop the name, keep whatever follows
    while (p < s.length && s[p] === "[") {
      let d = 1;
      p++;
      while (p < s.length && d > 0) {
        if (s[p] === "[") d++;
        else if (s[p] === "]") d--;
        p++;
      }
    }
    i = p;
  }
  return clean(out.split(SIM).join("~").replace(/\s*\|\s*$/, ""));
}

type Ev =
  | { t: "entry"; org: string; title: string; location: string; period: string }
  | { t: "bullet"; text: string }
  | { t: "skill"; label: string; items: string };

/** `\textbf{Gitlytics} $|$ \emph{Python, Flask}` → org + title */
function splitHeading(raw: string): { org: string; title: string } {
  const txt = unTex(raw);
  const m = txt.split(/\s*[|—–]\s*|\s+---\s+/);
  const org = (m[0] ?? "").replace(/\*\*/g, "").trim();
  const title = m.slice(1).join(" | ").replace(/\*\*/g, "").trim();
  return { org, title };
}

const looksLikeDate = (s: string) => DATE_RE.test(s);

function scanTexSection(body: string): Ev[] {
  const evs: Ev[] = [];
  let i = 0;
  const stop = /\\(item|resumeItem|resumeSubItem|cventry|cvproject|cvline|resumeSubheading|resumeProjectHeading|resumeEducationHeading|resumeSubSubheading|skillrow|end|section|begin)\b/;

  while (i < body.length) {
    if (body[i] !== "\\") {
      i++;
      continue;
    }
    const m = /^\\([a-zA-Z]+)\*?/.exec(body.slice(i));
    if (!m) {
      i++;
      continue;
    }
    const name = m[1];
    const after = i + m[0].length;

    if (name === "cventry") {
      const { args, end } = readArgs(body, after, 4);
      evs.push({
        t: "entry",
        org: unTex(args[0] ?? ""),
        location: unTex(args[1] ?? ""),
        title: unTex(args[2] ?? ""),
        period: unTex(args[3] ?? ""),
      });
      i = end;
      continue;
    }
    if (name === "cvproject") {
      const { args, end } = readArgs(body, after, 3);
      evs.push({
        t: "entry",
        org: unTex(args[0] ?? ""),
        title: unTex(args[1] ?? "").replace(/^\|\s*/, ""),
        location: "",
        period: unTex(args[2] ?? ""),
      });
      i = end;
      continue;
    }
    if (name === "cvline") {
      const { args, end } = readArgs(body, after, 2);
      const { org, title } = splitHeading(args[0] ?? "");
      evs.push({ t: "entry", org, title, location: "", period: unTex(args[1] ?? "") });
      i = end;
      continue;
    }
    if (name === "resumeSubheading" || name === "resumeEducationHeading" || name === "resumeSubSubheading") {
      // Jake's template renders two rows as {left}{right}{left}{right}, but the
      // semantics flip between sections — Education leads with the school,
      // Experience leads with the role. Whichever right-hand cell holds the
      // date tells us which row is which.
      const { args, end } = readArgs(body, after, 4);
      const a = args.map((x) => unTex(x));
      const roleFirst = looksLikeDate(a[1] ?? "") && !looksLikeDate(a[3] ?? "");
      evs.push(
        roleFirst
          ? { t: "entry", org: a[2] ?? "", title: a[0] ?? "", period: a[1] ?? "", location: a[3] ?? "" }
          : { t: "entry", org: a[0] ?? "", title: a[2] ?? "", location: a[1] ?? "", period: a[3] ?? "" }
      );
      i = end;
      continue;
    }
    if (name === "resumeProjectHeading") {
      const { args, end } = readArgs(body, after, 2);
      const { org, title } = splitHeading(args[0] ?? "");
      evs.push({ t: "entry", org, title, location: "", period: unTex(args[1] ?? "") });
      i = end;
      continue;
    }
    if (name === "skillrow") {
      const { args, end } = readArgs(body, after, 2);
      evs.push({ t: "skill", label: unTex(args[0] ?? "").replace(/\*\*/g, ""), items: unTex(args[1] ?? "") });
      i = end;
      continue;
    }
    if (name === "resumeItem" || name === "resumeSubItem") {
      const { args, end } = readArgs(body, after, 1);
      const text = unTex(args[0] ?? "");
      if (text) evs.push({ t: "bullet", text });
      i = end;
      continue;
    }
    if (name === "item") {
      // `\item text…` runs until the next structural command
      let p = after;
      while (p < body.length && /\s/.test(body[p])) p++;
      if (body[p] === "[") {
        // `\item[]` / `\item[label]` — the optional marker is not content
        let d = 1;
        p++;
        while (p < body.length && d > 0) {
          if (body[p] === "[") d++;
          else if (body[p] === "]") d--;
          p++;
        }
      } else p = after;
      const rest = body.slice(p);
      const nxt = rest.search(stop);
      const chunk = nxt === -1 ? rest : rest.slice(0, nxt);
      // an `\item{ \textbf{Languages}{: …} \\ … }` skills blob keeps its line breaks
      for (const piece of chunk.split(/\\\\/)) {
        const text = unTex(piece);
        if (text) evs.push({ t: "bullet", text });
      }
      i = p + chunk.length;
      continue;
    }
    i = after;
  }
  return evs;
}

/** Bullets in a skills section are really `Label: items` rows. */
function skillsFromEvs(evs: Ev[]) {
  const skills: { label: string; items: string }[] = [];
  for (const ev of evs) {
    if (ev.t === "skill") {
      skills.push({ label: ev.label, items: ev.items });
      continue;
    }
    const text = ev.t === "bullet" ? ev.text : `${ev.org} ${ev.title}`.trim();
    if (!text) continue;
    const m = /^\s*\**(.{1,44}?)\**\s*[:：]\s*(.+)$/.exec(text);
    if (m) skills.push({ label: clean(m[1]), items: clean(m[2]) });
    else skills.push({ label: "", items: text });
  }
  return skills.filter((s) => s.items || s.label);
}

function entriesFromEvs(evs: Ev[], kind: EntryKind): DraftEntry[] {
  const entries: DraftEntry[] = [];
  for (const ev of evs) {
    if (ev.t === "entry") {
      entries.push({ kind, org: ev.org, title: ev.title, location: ev.location, period: ev.period, bullets: [] });
    } else if (ev.t === "bullet") {
      if (!entries.length)
        entries.push({ kind, org: "", title: "", location: "", period: "", bullets: [] });
      entries[entries.length - 1].bullets.push(ev.text);
    }
  }
  return entries.filter((e) => e.org || e.title || e.bullets.length);
}

export function parseTex(src: string): Draft {
  const source = stripComments(src);
  const warnings: string[] = [];
  const profile: Partial<Profile> = {};

  // ---- header: everything before the first \section
  const firstSection = source.search(/\\section\*?\s*\{/);
  const head = firstSection === -1 ? source : source.slice(0, firstSection);
  const nameM =
    /\\(?:Huge|LARGE|huge)\s*(?:\\scshape)?\s*\{?([^\\{}\n]{2,60})\}?/.exec(head) ??
    /\\textbf\s*\{\s*\\(?:Huge|LARGE)\s*([^\\{}\n]{2,60})\}/.exec(head);
  if (nameM) profile.name = clean(nameM[1]);
  profileFromText(unTex(head), profile);
  if (!profile.name) warnings.push("warnNoName");

  // ---- sections
  const sections: DraftSection[] = [];
  const re = /\\section\*?\s*\{/g;
  const marks: { title: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const { args, end } = readArgs(source, m.index + m[0].length - 1, 1);
    marks.push({ title: unTex(args[0] ?? "").replace(/\*\*/g, ""), start: end });
  }
  marks.forEach((mark, idx) => {
    const body = source.slice(mark.start, marks[idx + 1]?.start ?? source.length);
    const evs = scanTexSection(body);
    if (!evs.length) return;
    if (isSkillsSection(mark.title) || evs.every((e) => e.t === "skill")) {
      sections.push({ title: mark.title, type: "skills", entries: [], skills: skillsFromEvs(evs) });
    } else {
      const entries = entriesFromEvs(evs, kindForSection(mark.title));
      if (entries.length) sections.push({ title: mark.title, type: "entries", entries, skills: [] });
    }
  });

  if (!sections.length) warnings.push("warnNoSections");
  return { source: "tex", profile, sections, warnings };
}

/* =====================================================================
 *  PDF / plain text (line-oriented heuristics)
 * ===================================================================== */

export interface TextLine {
  text: string;
  /** left edge, in PDF points; 0 for pasted text */
  x: number;
  /** right-aligned tail split off by a wide horizontal gap (dates, locations) */
  right?: string;
  size: number;
  page: number;
}

/** One positioned run of text as pdf.js reports it. */
export interface Piece {
  str: string;
  x: number;
  y: number;
  /** advance width */
  w: number;
  size: number;
}

/**
 * Positioned runs → visual lines, splitting a right-aligned tail (dates,
 * locations) off at the widest gap. Kept here, away from the pdf.js plumbing,
 * so the layout heuristics stay testable on their own.
 */
export function linesFromPieces(pieces: Piece[], page: number): TextLine[] {
  const out: TextLine[] = [];
  if (!pieces.length) return out;

  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Piece[][] = [];
  for (const piece of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - piece.y) <= Math.max(1.6, piece.size * 0.35)) row.push(piece);
    else rows.push([piece]);
  }

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const size = Math.max(...row.map((r) => r.size));

    let splitAt = -1;
    let widest = 0;
    for (let i = 1; i < row.length; i++) {
      const gap = row[i].x - (row[i - 1].x + row[i - 1].w);
      if (gap > widest) {
        widest = gap;
        splitAt = i;
      }
    }
    const useSplit = widest >= Math.max(22, size * 2.2) && splitAt > 0;

    const join = (items: Piece[]) =>
      items
        .reduce((acc, it, i) => {
          if (i === 0) return it.str;
          const gap = it.x - (items[i - 1].x + items[i - 1].w);
          return acc + (gap > size * 0.22 && !/\s$/.test(acc) ? " " : "") + it.str;
        }, "")
        .replace(/\s+/g, " ")
        .trim();

    const left = join(useSplit ? row.slice(0, splitAt) : row);
    const right = useSplit ? join(row.slice(splitAt)) : "";
    if (!left && !right) continue;
    out.push({ text: left || right, x: row[0].x, right: left ? right || undefined : undefined, size, page });
  }
  return out;
}

const BULLET_GLYPH = /^\s*([•‣◦▪▸·∙●○*+]|[-–—](?=\s))\s*/;

const isSectionHeading = (l: TextLine, bodySize: number) => {
  const t = clean(l.text);
  if (!t || t.length > 46 || BULLET_GLYPH.test(l.text)) return false;
  if (/[.;,]$/.test(t)) return false;
  // the name at the top is set far larger than any section rule — don't eat it
  if (l.size > bodySize * 1.7) return false;
  if (KNOWN_SECTIONS.test(t.replace(/[^\w &]/g, "").trim())) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  const caps = letters.length >= 3 && letters === letters.toUpperCase();
  // entry names often run a point above the bullets — only a clear jump counts
  const bigger = l.size >= bodySize * 1.2;
  return (caps || bigger) && t.split(/\s+/).length <= 5 && !l.right;
};

/** Typographic glyphs a PDF renders but nobody wants to retype. */
const NORM: [RegExp, string][] = [
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[∼~˜]/g, "~"],
  [/ﬁ/g, "fi"],
  [/ﬂ/g, "fl"],
  [/ /g, " "],
];
const norm = (s: string) => NORM.reduce((a, [re, r]) => a.replace(re, r), s);

/** Shared by the PDF path and by pasted plain text. */
export function draftFromLines(input: TextLine[], source: "pdf" | "text"): Draft {
  const lines = input.map((l) => ({ ...l, text: norm(l.text), right: l.right ? norm(l.right) : undefined }));
  const warnings: string[] = [];
  const profile: Partial<Profile> = {};
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 10;

  const firstHeading = lines.findIndex((l) => isSectionHeading(l, bodySize));
  const head = (firstHeading === -1 ? lines.slice(0, 4) : lines.slice(0, firstHeading))
    .map((l) => [l.text, l.right].filter(Boolean).join(" "))
    .join("\n");
  const headLines = head.split("\n").map(clean).filter(Boolean);
  const nameLine =
    headLines.find((t) => !EMAIL_RE.test(t) && !/\d/.test(t) && t.split(/\s+/).length <= 5) ?? headLines[0];
  if (nameLine) profile.name = nameLine.replace(/\*\*/g, "");
  profileFromText(head, profile);

  const sections: DraftSection[] = [];
  let cur: DraftSection | null = null;
  let curKind: EntryKind = "experience";
  let lastWasBullet = false;
  let bulletX = Infinity;

  const pushEntry = (e: DraftEntry) => {
    if (!cur || cur.type !== "entries") return;
    cur.entries.push(e);
  };

  for (let i = firstHeading === -1 ? 0 : firstHeading; i < lines.length; i++) {
    const l = lines[i];
    const raw = clean(l.text);
    if (!raw) continue;

    if (isSectionHeading(l, bodySize)) {
      const title = raw.replace(/\s{2,}/g, " ");
      curKind = kindForSection(title);
      cur = {
        title,
        type: isSkillsSection(title) ? "skills" : "entries",
        entries: [],
        skills: [],
      };
      sections.push(cur);
      lastWasBullet = false;
      bulletX = Infinity;
      continue;
    }
    if (!cur) {
      cur = { title: "Experience", type: "entries", entries: [], skills: [] };
      sections.push(cur);
    }

    if (cur.type === "skills") {
      const text = [raw.replace(BULLET_GLYPH, ""), l.right].filter(Boolean).join(" ");
      const m = /^(.{1,44}?)\s*[:：]\s*(.+)$/.exec(text);
      if (m) cur.skills.push({ label: clean(m[1]), items: clean(m[2]) });
      else if (cur.skills.length) {
        // wrapped continuation of the previous row
        const prev = cur.skills[cur.skills.length - 1];
        prev.items = clean(`${prev.items} ${text}`);
      } else cur.skills.push({ label: "", items: clean(text) });
      continue;
    }

    if (BULLET_GLYPH.test(l.text)) {
      const text = clean(l.text.replace(BULLET_GLYPH, ""));
      if (!cur.entries.length) pushEntry({ kind: curKind, org: "", title: "", location: "", period: "", bullets: [] });
      cur.entries[cur.entries.length - 1].bullets.push(text);
      lastWasBullet = true;
      bulletX = l.x;
      continue;
    }

    const last = cur.entries[cur.entries.length - 1];

    // wrapped bullet text keeps the bullet's indent
    if (lastWasBullet && last?.bullets.length && l.x >= bulletX - 1.5) {
      last.bullets[last.bullets.length - 1] = clean(`${last.bullets[last.bullets.length - 1]} ${raw}`);
      continue;
    }

    lastWasBullet = false;
    const tail = l.right ? clean(l.right) : "";
    const dateish = !!tail && looksLikeDate(tail);

    // A second header line right under an entry is its role / degree — unless it
    // carries its own date, which means it is a second entry (e.g. an awards list).
    const isSecondRow =
      last && !last.bullets.length && !last.title && !!(last.org || last.period || last.location);
    if (isSecondRow && !(dateish && last!.period)) {
      const firstRowDated = !!last!.period;
      last!.title = raw;
      if (dateish && !last!.period) last!.period = tail;
      else if (tail && !last!.location) last!.location = tail;
      // the date sitting on the first row means that row was the role, not the org
      if (firstRowDated && !dateish) [last!.org, last!.title] = [last!.title, last!.org];
      continue;
    }

    // `Project name | tech stack` and `Award — placing` are one-line headers
    const [head, ...rest] = raw.split(/\s+[|—]\s+/);
    pushEntry({
      kind: curKind,
      org: clean(head),
      title: clean(rest.join(" | ")),
      location: dateish ? "" : tail,
      period: dateish ? tail : "",
      bullets: [],
    });
  }

  for (const s of sections) {
    s.entries = s.entries.filter((e) => e.org || e.title || e.bullets.length);
    s.skills = s.skills.filter((k) => k.label || k.items);
  }
  const kept = sections.filter((s) => (s.type === "skills" ? s.skills.length : s.entries.length));

  if (!kept.length) warnings.push("warnNoLayout");
  if (source === "pdf")
    warnings.push("warnPdfGuess");

  return { source, profile, sections: kept, warnings };
}

/** Pasted plain text — no coordinates, so indentation stands in for x. */
export function parsePlainText(src: string): Draft {
  const lines: TextLine[] = src
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => ({
      text: l.trim(),
      x: (l.match(/^\s*/)?.[0].length ?? 0) * 3,
      size: 10,
      page: 1,
    }));
  return draftFromLines(lines, "text");
}

export const draftStats = (d: Draft) => ({
  entries: d.sections.reduce((n, s) => n + s.entries.length, 0),
  bullets: d.sections.reduce((n, s) => n + s.entries.reduce((m, e) => m + e.bullets.length, 0), 0),
  skills: d.sections.reduce((n, s) => n + s.skills.length, 0),
});

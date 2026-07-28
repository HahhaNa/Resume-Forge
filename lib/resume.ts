import { CONTACT_FIELDS } from "./types";
import type { ContactField, DB, Variant, Entry } from "./types";

export interface Block {
  id: string;
  org: string;
  title: string;
  location: string;
  period: string;
  kind: Entry["kind"];
  bullets: { id: string; text: string }[];
}

export interface RSection {
  id: string;
  title: string;
  type: "entries" | "skills";
  blocks: Block[];
  skills: { id: string; label: string; items: string }[];
}

/** One item in the header line: what the reader sees, and where it points. */
export interface ContactItem {
  field: ContactField;
  text: string;
  href: string | null;
}

export interface Resolved {
  name: string;
  contact: ContactItem[];
  sections: RSection[];
  bulletCount: number;
  wordCount: number;
}

/**
 * Where a header contact links to, or null when it is plain text (a phone number).
 * The preview and the generated .tex both use this, so a link works the same in
 * print, in Save-as-PDF, and in the compiled LaTeX.
 */
export function contactHref(c: string): string | null {
  if (c.includes("@") && !c.includes("/")) return `mailto:${c}`;
  if (/^https?:\/\//i.test(c)) return c;
  if (c.includes(".") && !c.startsWith("(")) return `https://${c}`;
  return null;
}

/**
 * What the header shows for a contact. In "short" mode a profile URL collapses to its
 * platform name and a personal site to its bare host — the link still carries the full
 * URL, so nothing is lost on screen or in a PDF. It is lost on paper, which is why
 * "full" stays the default.
 */
export function contactText(field: ContactField, value: string, style: "full" | "short"): string {
  if (style !== "short") return value;
  if (field === "linkedin") return "LinkedIn";
  if (field === "github") return "GitHub";
  if (field === "site")
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "");
  return value;
}

export function resolve(db: DB, variant: Variant): Resolved {
  const on = new Set(variant.bulletIds);
  const byId = new Map(db.entries.map((e) => [e.id, e]));
  const skById = new Map(db.skills.map((s) => [s.id, s]));
  const p = db.profile;

  // the variant's own value wins; blank falls back to the profile. Email is always shown —
  // the rest are opt-out per variant, which is how a public CV drops its phone number.
  const value = (f: ContactField) => (variant.contact?.[f] ?? "").trim() || (p[f] ?? "").trim();
  const shown = (f: ContactField) => f === "email" || variant.header[f];
  const style = variant.linkStyle ?? "full";

  const contact: ContactItem[] = CONTACT_FIELDS.filter((f) => shown(f) && value(f)).map((f) => ({
    field: f,
    text: contactText(f, value(f), style),
    href: contactHref(value(f)),
  }));

  let bulletCount = 0;
  let words = 0;

  const sections: RSection[] = variant.sections
    .map((sec) => {
      if (sec.type === "skills") {
        const skills = sec.ids.map((i) => skById.get(i)).filter(Boolean) as DB["skills"];
        skills.forEach((s) => (words += s.items.split(/\s+/).length));
        return { id: sec.id, title: sec.title, type: "skills" as const, blocks: [], skills };
      }
      const blocks: Block[] = sec.ids
        .map((i) => byId.get(i))
        .filter(Boolean)
        .filter((e) => {
          // an experience/project/activity with every bullet deselected adds nothing — drop it
          const k = (e as Entry).kind;
          if (k === "education" || k === "award") return true;
          return (e as Entry).bullets.some((b) => on.has(b.id));
        })
        .map((e) => {
          const bs = (e as Entry).bullets.filter((b) => on.has(b.id));
          bulletCount += bs.length;
          bs.forEach((b) => (words += b.text.split(/\s+/).length));
          return {
            id: (e as Entry).id,
            org: (e as Entry).org,
            title: (e as Entry).title,
            location: (e as Entry).location,
            period: (e as Entry).period,
            kind: (e as Entry).kind,
            bullets: bs.map((b) => ({ id: b.id, text: b.text })),
          };
        });
      return { id: sec.id, title: sec.title, type: "entries" as const, blocks, skills: [] };
    })
    .filter((s) => (s.type === "skills" ? s.skills.length > 0 : s.blocks.length > 0));

  return { name: p.name, contact, sections, bulletCount, wordCount: words };
}

/* ---------------- LaTeX ---------------- */

const ESC: Record<string, string> = {
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "^": "\\^{}",
  "\\": "\\textbackslash{}",
};

export function tex(s: string): string {
  return s
    .replace(/[&%$#_{}^\\]/g, (c) => ESC[c])
    .replace(/~/g, "$\\sim$")
    .replace(/×/g, "$\\times$")
    .replace(/≥/g, "$\\geq$")
    .replace(/≤/g, "$\\leq$")
    .replace(/→/g, "$\\rightarrow$");
}

/** `**bold**` -> \textbf{...}; everything else escaped. */
export function richTex(s: string): string {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? `\\textbf{${tex(part.slice(2, -2))}}`
        : tex(part)
    )
    .join("");
}

/**
 * A URL going into `\href`'s first argument. `%` would comment out the rest of the
 * line and `#` is a parameter token, so both have to be escaped even though the rest
 * of a URL passes through untouched.
 */
export function texUrl(u: string): string {
  return u.replace(/([%#\\])/g, "\\$1");
}

/**
 * What pdflatex actually prints for a source string.
 *
 * Entries are stored in TeX's plain-text conventions — `--` for a range, `---` for an
 * aside, `~` for "about", a straight apostrophe — and the compiler turns those into real
 * glyphs on its way to the PDF (`~` via the `$\sim$` that `tex()` emits, the rest via the
 * font's own ligatures). The preview has to make the same substitutions, or Save-as-PDF
 * ships the raw markup where the .tex ships an en dash.
 *
 * Order matters: the longest run wins, so `---` is consumed before `--`.
 */
export function display(s: string): string {
  return s
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/`/g, "‘")
    .replace(/'/g, "’")
    .replace(/~/g, "∼");
}

/**
 * Runs of a string, flagging the ones that must not be hyphenated.
 *
 * Both engines will break "Taiwan" as "Tai-wan" once hyphenation is on, and a name split
 * across a line reads as a typo. The stand-in for "proper noun" is a capitalised, purely
 * alphabetic word of five letters or more that does not open a sentence — TeX will not
 * hyphenate anything shorter (\lefthyphenmin 2 + \righthyphenmin 3), a lowercase word is
 * ordinary vocabulary that should keep breaking, and a word carrying its own hyphen already
 * has the break points its author chose. It over-protects the odd sentence-initial capital
 * that follows an abbreviation's full stop; that costs a break opportunity, nothing more.
 */
export function protectParts(s: string) {
  const out: { key: number; text: string; keep: boolean }[] = [];
  let at = 0;
  for (const m of s.matchAll(/[A-Za-z][A-Za-z'’‐-]*/g)) {
    const w = m[0];
    const before = s.slice(0, m.index).trimEnd();
    const keep =
      w.length >= 5 && /^[A-Z][A-Za-z]*$/.test(w) && before !== "" && !/[.;:!?]$/.test(before);
    if (!keep) continue;
    if (m.index > at) out.push({ key: out.length, text: s.slice(at, m.index), keep: false });
    out.push({ key: out.length, text: w, keep: true });
    at = m.index + w.length;
  }
  if (at < s.length) out.push({ key: out.length, text: s.slice(at), keep: false });
  return out;
}

export function richHtmlParts(s: string) {
  return s
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) => ({
      key: i,
      bold: part.startsWith("**") && part.endsWith("**") && part.length > 4,
      text: display(
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? part.slice(2, -2) : part
      ),
    }))
    .filter((p) => p.text.length > 0);
}

/**
 * Margin in inches, the rest in points — the units the preamble below wants them in. This is
 * the one table both renderers read: the preamble puts these straight into \titlespacing and
 * the itemize options, and gaps() in Preview.tsx derives its margins from the same numbers.
 *
 * `sectionAfter` is the air under a section's rule before its first entry. It is deliberately
 * small: the rule already does the separating, and space under it only reads as the heading
 * drifting away from the section it labels. `sectionBefore` is where the break lives — that gap
 * should stay visibly larger than this one, so a section groups with the entries below it.
 */
export const DENSITY: Record<Variant["density"], Record<string, number>> = {
  tight: { margin: 0.42, entrySep: 4, bulletSep: 1.5, sectionBefore: 5, sectionAfter: 3 },
  normal: { margin: 0.55, entrySep: 6, bulletSep: 2.5, sectionBefore: 8, sectionAfter: 3 },
  airy: { margin: 0.7, entrySep: 8, bulletSep: 3.5, sectionBefore: 11, sectionAfter: 4 },
};

/**
 * Every proper noun on the sheet, for one `\hyphenation` line in the preamble. Listing a word
 * with no discretionary hyphen in it is how you tell TeX the word has no legal break points.
 * Deduped case-insensitively, because TeX matches these against lowercased input anyway.
 */
function protectedWords(r: Resolved): string[] {
  const seen = new Map<string, string>();
  const scan = (s: string) => {
    for (const p of protectParts(s)) if (p.keep) seen.set(p.text.toLowerCase(), p.text);
  };
  scan(r.name);
  for (const sec of r.sections) {
    scan(sec.title);
    for (const b of sec.blocks) {
      [b.org, b.title, b.location, b.period].forEach(scan);
      b.bullets.forEach((x) => scan(x.text));
    }
    for (const s of sec.skills) [s.label, s.items].forEach(scan);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Where the compiled page is tuned to the HTML preview rather than the other way round.
 *
 * The preview is the sheet you actually design against, so it is the reference; these two
 * lengths are what pdflatex needs in order to land on the same marks. Both were measured on
 * 2026-08-04 by printing the preview through Chrome and diffing row positions against the
 * compiled PDF: the header block sat 3pt high in LaTeX, and every section ran 3.5pt tighter.
 * With those in, every matched row lands within 2pt and the residual drift is 0.3pt per 100pt
 * of page — under the noise in measuring a row's position from its ink. Re-measure if the
 * preview's typography moves.
 */
const HEADER_DROP = 6 + 3;
const SECTION_SLACK = 3.5;
/**
 * How far \titlerule is pulled up under a section's small caps. Only pdflatex needs it: the
 * preview draws that rule as a border-bottom on `.sec`, where `lineHeight: 1` already sets it
 * against the caps. At 4pt the rule crowded the letters in the compiled PDF while the preview
 * kept its air, so this is the one number the two renderers deliberately hold apart.
 */
const RULE_LIFT = 1;

export function buildTex(db: DB, variant: Variant): string {
  const r = resolve(db, variant);
  const d = DENSITY[variant.density];
  const stampDate = new Date().toISOString().slice(0, 10);

  // `article` only knows 10/11/12pt and silently ignores anything else, so 10.5 has to
  // come from the `fontsize` package or the class would quietly typeset at 10pt.
  const classOpt = variant.fontSize === 10.5 ? "10pt" : `${variant.fontSize}pt`;
  const sizePkg =
    variant.fontSize === 10.5 ? `\\usepackage[fontsize=${variant.fontSize}pt]{fontsize}\n` : "";

  const head = `% ---------------------------------------------------------------
%  ${tex(db.profile.name)} — resume, variant "${tex(variant.name)}"
%  ${tex(variant.label)}
%  Generated by Resume Forge on ${stampDate}
%  Bullets: ${r.bulletCount} · selected ids embedded below for traceability
%  ${variant.bulletIds.join(" ")}
% ---------------------------------------------------------------
\\documentclass[letterpaper,${classOpt}]{article}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
${sizePkg}\\usepackage{charter}
\\usepackage[top=${d.margin}in,bottom=${d.margin}in,left=${d.margin + 0.06}in,right=${d.margin + 0.06}in]{geometry}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{tabularx}
\\usepackage{xcolor}
\\usepackage{fancyhdr}
\\usepackage{needspace}
\\pagestyle{fancy}\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\raggedright
\\setlength{\\parindent}{0pt}
\\setlength{\\tabcolsep}{0in}
\\pdfgentounicode=1
\\hypersetup{pdftitle={${tex(db.profile.name)} - Resume (${tex(variant.name)})},
  pdfauthor={${tex(db.profile.name)}},
  pdfsubject={variant=${tex(variant.name)}; built=${stampDate}}}

% Proper nouns, listed with no break points so TeX leaves them whole — see protectedWords().
\\hyphenation{${protectedWords(r).join(" ")}}

\\titleformat{\\section}{\\vspace{2pt}\\scshape\\large}{}{0em}{}[\\vspace{-${RULE_LIFT}pt}\\titlerule\\vspace{-2pt}]
\\titlespacing*{\\section}{0pt}{${d.sectionBefore}pt}{${d.sectionAfter + SECTION_SLACK}pt}

% \\linewidth, not \\textwidth: these sit inside cvlist, whose leftmargin narrows the line.
% Sized to \\textwidth they hang exactly that much past the right margin, and the dates
% stop lining up with the section rules. No trailing \\\\ either — it would add an empty
% row, i.e. a blank line of air under every entry heading. And the left columns need a
% \\raggedright of their own: a p{} cell starts a fresh paragraph shape, so the preamble's
% \\raggedright does not reach inside it and the cell sets justified — which shows up as
% stretched word spacing on any heading long enough to wrap.
\\newcommand{\\cventry}[4]{%
  \\needspace{3\\baselineskip}\\item[]
  \\begin{tabular*}{\\linewidth}[t]{@{\\extracolsep{\\fill}}>{\\raggedright\\arraybackslash}p{0.72\\linewidth} >{\\raggedleft\\arraybackslash}p{0.28\\linewidth}@{}}
    \\textbf{#1} & #2 \\\\ \\textit{\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{-2pt}}
\\newcommand{\\cvproject}[3]{%
  \\needspace{3\\baselineskip}\\item[]
  \\begin{tabular*}{\\linewidth}[t]{@{\\extracolsep{\\fill}}>{\\raggedright\\arraybackslash}p{0.78\\linewidth} >{\\raggedleft\\arraybackslash}p{0.22\\linewidth}@{}}
    \\textbf{#1}#2 & \\small #3
  \\end{tabular*}\\vspace{-2pt}}
\\newcommand{\\cvline}[2]{%
  \\item[]\\begin{tabular*}{\\linewidth}[t]{@{\\extracolsep{\\fill}}>{\\raggedright\\arraybackslash}p{0.78\\linewidth} >{\\raggedleft\\arraybackslash}p{0.22\\linewidth}@{}}
    #1 & \\small #2 \\end{tabular*}\\vspace{-4pt}}
\\newenvironment{cvlist}
  {\\begin{itemize}[leftmargin=0.15in,label={},topsep=2pt,parsep=0pt,itemsep=${d.entrySep}pt]}
  {\\end{itemize}\\vspace{-4pt}}
\\newenvironment{bullets}
  {\\begin{itemize}[leftmargin=0.18in,topsep=2pt,parsep=0pt,itemsep=${d.bulletSep}pt,label=$\\bullet$]\\small}
  {\\end{itemize}\\vspace{-4pt}}
\\newcommand{\\skillrow}[2]{\\textbf{#1}: #2 \\\\}

\\begin{document}

\\begin{center}
  {\\Huge\\scshape ${tex(r.name)}}\\\\[3pt]
  {\\small ${r.contact
    .map((c) => (c.href ? `\\href{${texUrl(c.href)}}{${tex(c.text)}}` : tex(c.text)))
    .join(" \\;$\\cdot$\\; ")}}
\\end{center}
\\vspace{-${HEADER_DROP}pt}
`;

  const body = r.sections
    .map((sec) => {
      if (sec.type === "skills") {
        return `\n\\section{${tex(sec.title)}}\n\\begin{cvlist}\n  \\item[]\\small\n${sec.skills
          .map((s) => `  \\skillrow{${richTex(s.label)}}{${richTex(s.items)}}`)
          .join("\n")}\n\\end{cvlist}\n`;
      }
      const blocks = sec.blocks
        .map((bk) => {
          const bl = bk.bullets.length
            ? `\n  \\begin{bullets}\n${bk.bullets.map((b) => `    \\item ${richTex(b.text)}`).join("\n")}\n  \\end{bullets}`
            : "";
          if (bk.kind === "award")
            return `  \\cvline{${richTex(bk.org)}${bk.title ? ` --- ${richTex(bk.title)}` : ""}}{${tex(bk.period)}}${bl}`;
          if (bk.kind === "project")
            return `  \\cvproject{${richTex(bk.org)}}{${bk.title ? ` \\small$|$ \\emph{\\small ${richTex(bk.title)}}` : ""}}{${tex(bk.period)}}${bl}`;
          return `  \\cventry{${richTex(bk.org)}}{${tex(bk.location)}}{${richTex(bk.title)}}{${tex(bk.period)}}${bl}`;
        })
        .join("\n\n");
      return `\n\\section{${tex(sec.title)}}\n\\begin{cvlist}\n${blocks}\n\\end{cvlist}\n`;
    })
    .join("");

  return `${head}${body}\n\\end{document}\n`;
}

/** `JaneDoe_Resume_hw_20260730` — name, kind, variant slug, local date. */
export function baseName(db: DB, variant: Variant) {
  const n = db.profile.name.replace(/[^A-Za-z0-9]/g, "") || "Resume";
  const d = new Date();
  // local date, not toISOString(): UTC+8 would stamp yesterday all morning
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${n}_Resume_${variant.name}_${stamp}`;
}

export function fileName(db: DB, variant: Variant, ext: string) {
  return `${baseName(db, variant)}.${ext}`;
}

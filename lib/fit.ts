/* ------------------------------------------------------------------ *
 * How tall a resume is, without a DOM.
 *
 * `Preview.tsx` already answers this exactly: it lays the sheet out and
 * reads `scrollHeight`. That answer is the truth, and it arrives too
 * late to be useful here — choosing which bullets to keep means asking
 * "how tall would it be *with* this one?" a few hundred times, and no
 * amount of care makes that affordable against a real layout.
 *
 * So this file re-derives the same geometry arithmetically. Every
 * constant below is the one `Preview.tsx` renders with, read off the
 * same DENSITY table the LaTeX preamble is built from; the one thing
 * that cannot be shared is line breaking, which the browser does with
 * real font metrics and this file estimates from average glyph widths.
 * That is the whole error budget, and it is why `estimate()` is used to
 * *choose* a selection and `Preview.tsx` is still what *reports* the
 * page count. A packer that is a line optimistic produces a resume the
 * gauge then calls 1.02 pages; a packer that is a line pessimistic
 * leaves white space. WIDTH_SAFETY leans it to the second, which is the
 * failure the user can see and fix.
 * ------------------------------------------------------------------ */

import { DENSITY } from "./resume";
import type { Resolved, RSection, Block } from "./resume";
import type { Variant } from "./types";

const PX_IN = 96;
const PX_PT = 96 / 72;

/** Preview height that fits on one compiled page. Kept in step with `Preview.tsx`. */
const CAL = 0.984;
const PAGE_H = 11 * PX_IN;
const PAGE_W = 8.5 * PX_IN;

const LEAD: Record<Variant["fontSize"], number> = { 10: 1.2, 10.5: 1.2, 11: 1.236 };
const LEAD_SM: Record<Variant["fontSize"], number> = { 10: 1.222, 10.5: 1.222, 11: 1.2 };

/** The `p{}` column splits from \cventry and \cvproject/\cvline. */
const ENTRY_COL = 0.72;
const LINE_COL = 0.78;
const CVLIST_INDENT = 0.15 * PX_IN;
const BULLET_INDENT = 0.18 * PX_IN;

/**
 * Average glyph advance in em, by character class, for XCharter at text sizes.
 * Measured off the rendered preview rather than the font tables: what matters is
 * where the browser breaks a line, and that is advance width plus the word space
 * it just refused to use. Four buckets get within a few percent of the real
 * width on ordinary resume prose, which is all the packer needs.
 */
function advance(c: string): number {
  if (c === " ") return 0.25;
  if ("iljtfr.,;:'`!|()[]{}I".includes(c)) return 0.3;
  if ("mwMW@%—".includes(c)) return 0.85;
  if (c >= "A" && c <= "Z") return 0.68;
  if (c >= "0" && c <= "9") return 0.5;
  return 0.48;
}

/**
 * `**bold**` is a delimiter, not ink — measuring it as text makes a heavily
 * marked-up bullet read a whole line longer than it prints.
 */
const inkOf = (s: string) => s.replace(/\*{2,}/g, "");

export function textWidth(s: string, fontPx: number): number {
  let em = 0;
  const ink = inkOf(s);
  for (const c of ink) em += advance(c);
  return em * fontPx;
}

/**
 * A margin on the estimate rather than on the page. Line breaking is the one
 * thing here that is guessed, and its error is proportional to how many lines a
 * run of text takes — so it belongs on the width, where one extra long bullet
 * costs one extra line, and not as a flat trim off the page, where it would
 * quietly cost a bullet on every resume regardless of shape.
 */
const WIDTH_SAFETY = 0.97;

export function lineCount(s: string, colPx: number, fontPx: number): number {
  if (!s.trim()) return 1;
  return Math.max(1, Math.ceil(textWidth(s, fontPx) / (colPx * WIDTH_SAFETY)));
}

/** The block spacings of `Preview.tsx`, which are the preamble's lengths less their clawbacks. */
export function gaps(density: Variant["density"]) {
  const d = DENSITY[density];
  const px = (pt: number) => Math.max(0, pt) * PX_PT;
  return {
    margin: d.margin,
    section: px(d.sectionBefore + 2 - 4),
    sectionFirst: px(d.sectionBefore + 2),
    sectionAfter: (-2 + d.sectionAfter) * PX_PT,
    header: px(8 - 6),
    entry: px(d.entrySep - 2),
    entryAfterBullets: px(d.entrySep - 4),
    bullet: px(d.bulletSep),
    topsep: px(2),
  };
}

/** Every length the estimator needs, derived once per variant. */
export interface Metrics {
  base: number;
  small: number;
  lead: number;
  leadSm: number;
  /** usable width inside the page margins */
  contentW: number;
  /** the width a bullet's text actually wraps in */
  bulletW: number;
  entryColW: number;
  lineColW: number;
  g: ReturnType<typeof gaps>;
  /** preview px that fit on one compiled page */
  pageH: number;
}

export function metrics(variant: Variant): Metrics {
  const g = gaps(variant.density);
  const base = variant.fontSize * 1.333;
  const side = g.margin + 0.06;
  const contentW = PAGE_W - 2 * side * PX_IN;
  return {
    base,
    small: base * 0.9,
    lead: LEAD[variant.fontSize],
    leadSm: LEAD_SM[variant.fontSize],
    contentW,
    bulletW: contentW - CVLIST_INDENT - BULLET_INDENT,
    entryColW: (contentW - CVLIST_INDENT) * ENTRY_COL,
    lineColW: (contentW - CVLIST_INDENT) * LINE_COL,
    g,
    pageH: (PAGE_H - 2 * g.margin * PX_IN) / CAL,
  };
}

/** What one bullet adds once its entry is already on the page. */
export function bulletHeight(text: string, m: Metrics): number {
  return lineCount(text, m.bulletW, m.small) * m.small * m.leadSm;
}

/**
 * What an entry costs before any of its bullets: the org/title rows, or the
 * single line an award or project heading takes.
 */
export function headHeight(b: Pick<Block, "kind" | "org" | "title" | "location" | "period">, m: Metrics): number {
  if (b.kind === "award") {
    return lineCount(`${b.org}${b.title ? ` — ${b.title}` : ""}`, m.lineColW, m.base) * m.base * m.lead;
  }
  if (b.kind === "project") {
    return lineCount(`${b.org}${b.title ? ` | ${b.title}` : ""}`, m.lineColW, m.base) * m.base * m.lead;
  }
  const org = lineCount(b.org, m.entryColW, m.base) * m.base * m.lead;
  const title = lineCount(b.title, m.entryColW, m.small) * m.small * m.lead;
  return org + title;
}

function blockHeight(b: Block, m: Metrics): number {
  let h = headHeight(b, m);
  if (b.bullets.length) {
    h += m.g.topsep;
    b.bullets.forEach((x, i) => {
      if (i) h += m.g.bullet;
      h += bulletHeight(x.text, m);
    });
  }
  return h;
}

function skillsHeight(sec: RSection, m: Metrics): number {
  const w = m.contentW - CVLIST_INDENT;
  return sec.skills.reduce(
    (h, s) => h + lineCount(`${s.label}: ${s.items}`, w, m.small) * m.small * m.leadSm,
    0
  );
}

/** The name and the contact row, which every variant pays for. */
export function headerHeight(r: Resolved, m: Metrics): number {
  const name = m.base * 2.4 * 1.05;
  const contact = r.contact.length ? m.small + 3 : 0;
  return name + contact + m.g.header;
}

export function sectionHeight(sec: RSection, m: Metrics, first: boolean): number {
  let h = (first ? m.g.sectionFirst : m.g.section) + m.base * 1.18 + 1 + m.g.sectionAfter + m.g.topsep;
  if (sec.type === "skills") return h + skillsHeight(sec, m);
  sec.blocks.forEach((b, i) => {
    if (i) {
      const prev = sec.blocks[i - 1];
      h += prev.kind === "award" || prev.bullets.length ? m.g.entryAfterBullets : m.g.entry;
    }
    h += blockHeight(b, m);
  });
  return h;
}

/** Estimated preview height, in the same px `Preview.tsx` measures. */
export function estimate(r: Resolved, variant: Variant): number {
  const m = metrics(variant);
  let h = headerHeight(r, m);
  r.sections.forEach((sec, i) => (h += sectionHeight(sec, m, i === 0)));
  return h;
}

/**
 * Pages, on the same scale the fill gauge reports — 0.94 is a comfortable
 * one-pager, 1.02 is a resume with one line on a second sheet.
 */
export function estimatePages(r: Resolved, variant: Variant): number {
  return estimate(r, variant) / metrics(variant).pageH;
}

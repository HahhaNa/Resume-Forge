"use client";

/**
 * Read a Word .docx into the same positioned-line shape the PDF path produces, so both feed
 * `draftFromLines` and neither needs its own idea of what a résumé looks like.
 *
 * A .docx is a zip of XML, and the two things a résumé encodes structurally — the tab (or table
 * cell) that pushes a date to the right margin, and the list paragraph that makes a bullet — map
 * onto exactly what the line heuristics already read out of a PDF's geometry. So the work here is
 * only unpacking: no dependency, no upload, `DecompressionStream` does the inflating.
 */
import type { TextLine } from "./import";

/* =====================================================================
 *  zip
 * ===================================================================== */

async function inflate(bytes: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return bytes; // stored
  if (method !== 8) throw new Error(`unsupported .docx compression (method ${method})`);
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot unzip .docx");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * One member of a zip, by exact name. Read through the central directory rather than by walking
 * local headers: a streamed .docx leaves the sizes in the local header zeroed, and the central
 * directory is the copy that is always filled in.
 */
async function unzip(buf: ArrayBuffer, want: string): Promise<Uint8Array | null> {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // the end-of-central-directory record, found from the back past a possible archive comment
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 0xffff); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a .docx (no zip directory)");

  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  const names = new TextDecoder();

  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const packed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const cmtLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = names.decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === want) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      return inflate(u8.subarray(start, start + packed), method);
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}

/* =====================================================================
 *  WordprocessingML
 * ===================================================================== */

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const unxml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return ENTITY[e.toLowerCase()] ?? whole;
    const hex = e[1] === "x" || e[1] === "X";
    const code = parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });

const attr = (xml: string, tag: string) =>
  new RegExp(`<w:${tag}\\b[^>]*\\sw:val="([^"]*)"`).exec(xml)?.[1];

/** `<w:b/>` and `<w:b w:val="1"/>` are bold; `<w:b w:val="0"/>` and `<w:bCs/>` are not. */
const isBold = (rPr: string) => /<w:b\s*\/>|<w:b\s+[^>]*w:val="(?:1|true|on)"/.test(rPr);

/**
 * A paragraph's runs, flattened. Adjacent runs share a `**…**` wrapper — Word splits a sentence
 * into a run per spell-check state, and marking each one separately would litter the text with
 * empty emphasis.
 */
function runsToText(xml: string): { text: string; size: number } {
  const parts: { text: string; bold: boolean }[] = [];
  let size = 0;

  for (const run of xml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const body = run[1];
    const rPr = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? "";
    const half = Number(attr(rPr, "sz") ?? 0);
    if (half) size = Math.max(size, half / 2);

    let text = "";
    for (const bit of body.matchAll(/<w:tab\s*\/>|<w:br\s*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
      text += bit[0].startsWith("<w:tab") ? "\t" : bit[0].startsWith("<w:br") ? " " : unxml(bit[1] ?? "");
    }
    if (text) parts.push({ text, bold: isBold(rPr) });
  }

  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const { bold } = parts[i];
    let run = parts[i].text;
    while (bold && i + 1 < parts.length && parts[i + 1].bold) run += parts[++i].text;
    // the markers go inside the run's own padding, or the space ends up bolded and the word does not
    out += bold ? run.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, a, mid, b) => (mid ? `${a}**${mid}**${b}` : run)) : run;
  }
  return { text: out, size };
}

/** Word's built-in outline styles, for documents that lean on styles instead of point sizes. */
const STYLE_SIZE: [RegExp, number][] = [
  [/^title$/i, 16],
  [/^heading[12]$/i, 12.5],
  [/^heading[3-9]$/i, 11],
];

export function linesFromDocxXml(xml: string): TextLine[] {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const out: TextLine[] = [];

  /** `•`, `-`, `1.`, `a)` — a marker standing alone in its own tab stop. */
  const MARKER = /^([•‣◦▪▸·∙●○*+-]|\(?[0-9a-z]{1,3}[.)])$/i;

  const push = (raw: string, x: number, size: number, bullet: boolean) => {
    // a tab is the wide gap the PDF path splits on, so the tail behind it is the date/location
    const parts = raw
      .split(/\t+/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    // …unless the first stop holds only a list marker, which is how a converted `<li>` and a
    // hand-typed "• ⇥ text" both arrive. Taken as the line, they leave the text as a right-hand
    // tail and the bullet reads empty.
    let marked = bullet;
    while (parts.length > 1 && MARKER.test(parts[0])) {
      marked = true;
      parts.shift();
    }
    if (!parts.length) return;
    out.push({
      text: (marked ? "• " : "") + parts[0],
      right: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
      x,
      size,
      page: 1,
    });
  };

  const paragraph = (p: string) => {
    const pPr = /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? "";
    const style = attr(pPr, "pStyle") ?? "";
    const { text, size } = runsToText(p);
    if (!text.trim()) return;
    const styled = STYLE_SIZE.find(([re]) => re.test(style))?.[1] ?? 0;
    push(
      text,
      // twentieths of a point, the same unit the indent is authored in
      Number(/<w:ind\b[^>]*\sw:left="(-?\d+)"/.exec(pPr)?.[1] ?? 0) / 20,
      Math.max(size, styled) || 10,
      /<w:numPr\b/.test(pPr)
    );
  };

  // Tables are taken whole so their paragraphs are not also read as body paragraphs. A row is one
  // line with its cells tab-separated, which is how a two-column "employer | dates" table reads.
  for (const block of body.matchAll(
    /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
  )) {
    const chunk = block[0];
    if (!chunk.startsWith("<w:tbl")) {
      paragraph(chunk);
      continue;
    }
    for (const row of chunk.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
      const cells: string[] = [];
      let size = 0;
      let bullet = false;
      for (const cell of row[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)) {
        const r = runsToText(cell[1]);
        size = Math.max(size, r.size);
        bullet ||= /<w:numPr\b/.test(cell[1]);
        // a cell that wraps onto its own paragraphs is still one cell
        cells.push(r.text.replace(/\t+/g, " ").trim());
      }
      if (cells.some(Boolean)) push(cells.join("\t"), 0, size || 10, bullet);
    }
  }
  return out;
}

export async function docxToLines(file: File): Promise<TextLine[]> {
  const doc = await unzip(await file.arrayBuffer(), "word/document.xml");
  if (!doc) throw new Error("no word/document.xml — is this really a .docx?");
  return linesFromDocxXml(new TextDecoder().decode(doc));
}

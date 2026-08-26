"use client";

/**
 * Pull positioned text out of a PDF with pdf.js. The layout heuristics live in
 * `linesFromPieces`; this file is only the pdf.js plumbing.
 *
 * pdf.js is loaded straight from /public by the browser rather than bundled:
 * webpack's ESM interop chokes on pdf.mjs ("Object.defineProperty called on
 * non-object"), and a native import keeps the 1 MB library out of the app
 * chunks anyway. Both files are copied into /public by the postinstall script.
 */
import { linesFromPieces, type Piece, type TextLine } from "./import";

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}
interface PdfAnnotation {
  url?: string;
  unsafeUrl?: string;
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  getAnnotations: () => Promise<PdfAnnotation[]>;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<PdfPage>;
      destroy: () => Promise<void>;
    }>;
  };
}

let lib: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  lib ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "/pdf.min.mjs" as string).then(
    (m: PdfJs) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    }
  );
  return lib;
}

/**
 * Lines plus the URLs the pages link to. A contact row that reads `LinkedIn | Github` keeps its
 * addresses in the link annotations and nowhere else, so the text layer alone loses them.
 */
export async function pdfToLines(file: File): Promise<{ lines: TextLine[]; links: string[] }> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: TextLine[] = [];
  const links: string[] = [];

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        const tr = item.transform;
        if (!item.str?.trim() || !tr) continue;
        pieces.push({
          str: item.str,
          x: tr[4],
          y: tr[5],
          w: item.width || 0,
          size: Math.hypot(tr[1], tr[3]) || item.height || 10,
        });
      }
      lines.push(...linesFromPieces(pieces, p));
      // only the header's links are ever the profile's, and a resume that links out of a bullet
      // would otherwise donate that URL to it — so keep page order and let the caller take first
      for (const a of await page.getAnnotations()) {
        const url = a.url ?? a.unsafeUrl;
        if (url && !links.includes(url)) links.push(url);
      }
    }
  } finally {
    await doc.destroy();
  }
  return { lines, links };
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DB, Variant } from "@/lib/types";
import { DENSITY, display, protectParts, resolve, richHtmlParts } from "@/lib/resume";

const PX_IN = 96;
const PX_PT = 96 / 72;
/**
 * Calibration: preview height against the page pdflatex actually produces. It used to carry
 * real weight — 0.885, when the preview typeset at 1.28 leading and ran 14% long. Now that the
 * preview shares the preamble's spacing and XCharter's metrics, and HEADER_DROP/SECTION_SLACK
 * pull the compiled page onto the preview's marks, the two agree to within a couple of points
 * anywhere on the sheet.
 *
 * Measured 2026-08-04 over three densities x three font sizes: the one combination that both
 * compiles to a single page and keeps its ink inside the text block gives 0.995, and every row
 * on the sheet lands within 3pt of where pdflatex puts it — the two engines really are the same
 * height now. 0.984 rather than 0.995, because the fit is not the objective; calling the page
 * count is. normal/10pt fits on one page while its ink bbox reads a hair past the text block,
 * and only CAL <= 0.9849 turns that into "one page", so (0.963, 0.985] is the window that gets
 * all nine right. The gauge therefore reads ~1% low, the direction that does not promise a
 * second page nobody asked for. Re-measure from compiled PDFs whenever the preamble or the
 * preview's typography moves — changing sectionAfter alone is worth a couple of thousandths
 * here, and it has since gone back down to 3pt.
 */
const CAL = 0.984;
const PAGE_W = 8.5 * PX_IN;
const PAGE_H = 11 * PX_IN;
/**
 * Block spacing, in px, from the same DENSITY table the preamble is built from — the two used
 * to be separate tables in separate units and drifted apart.
 *
 * The commands the .tex defines all close with a negative \vspace to claw back the list glue
 * that follows them: -2pt on \cventry and \cvproject, -4pt on \cvline and on the `bullets`
 * environment, another -4pt where a cvlist ends just before a \section. Ignoring those was
 * most of the reason the printed page ran longer than the compiled one, so each gap here is
 * the LaTeX length minus its compensation, floored at zero the way TeX's glue effectively is.
 */
function gaps(density: Variant["density"]) {
  const d = DENSITY[density];
  const px = (pt: number) => Math.max(0, pt) * PX_PT;
  return {
    margin: d.margin,
    /** \titlespacing before + the \vspace{2pt} in \titleformat, less the cvlist's closing -4pt */
    section: px(d.sectionBefore + 2 - 4),
    /** the first section has no cvlist above it, so nothing claws that -4pt back */
    sectionFirst: px(d.sectionBefore + 2),
    /**
     * The \titleformat's trailing `[\vspace{-RULE_LIFTpt}\titlerule\vspace{-2pt}]` against
     * \titlespacing's after-length. A border-bottom already sits at the foot of the line box,
     * so only the -2pt and the after-length are left to apply here — RULE_LIFT is what the
     * tightened line-height on `.sec` stands in for, and it is set for pdflatex alone.
     */
    sectionAfter: (-2 + d.sectionAfter) * PX_PT,
    /** the `center` block's closing \topsep, less the \vspace{-6pt} the header ends with */
    header: px(8 - 6),
    /** cvlist itemsep, less the -2pt that \cventry/\cvproject end with */
    entry: px(d.entrySep - 2),
    /** the same, for a block whose `bullets` environment already took -4pt, and for \cvline */
    entryAfterBullets: px(d.entrySep - 4),
    /** `bullets` itemsep, between one \item and the next */
    bullet: px(d.bulletSep),
    /** topsep on the cvlist and on bullets */
    topsep: px(2),
  };
}
/**
 * `\baselineskip / fontsize` for the class the .tex asks for: 12/10 and 13.6/11 from
 * `article`, and 1.2 from the `fontsize` package at 10.5pt. `\small` carries its own ratio
 * (11/9 at 10pt, 12/10 at 11pt), and since the bullets are the bulk of the page it is worth
 * setting separately rather than letting the body ratio stand in for it.
 */
const LEAD: Record<Variant["fontSize"], number> = { 10: 1.2, 10.5: 1.2, 11: 1.236 };
const LEAD_SM: Record<Variant["fontSize"], number> = { 10: 1.222, 10.5: 1.222, 11: 1.2 };
/**
 * The `p{}` widths in \cventry and in \cvproject/\cvline. tabular* splits the line at a fixed
 * fraction; a flex row splits it wherever the date happens to end, so a heading that wraps in
 * one would sit on a single line in the other.
 */
const ENTRY_COL = "72%";
const LINE_COL = "78%";
/** `leftmargin` on the cvlist and bullets environments, in inches. */
const CVLIST_INDENT = 0.15 * PX_IN;
const BULLET_INDENT = 0.18 * PX_IN;

/**
 * A one-pager keeps its own padding inside a zero page box: that is also what makes Chrome drop
 * the date/URL header it otherwise stamps into the page margin, checkbox or not. Once the resume
 * spills over, the insets have to move into `@page` so pages after the first are inset too — the
 * header may reappear there, but a page starting flush against the paper edge is worse.
 */
function printCss(m: number, pages: number) {
  const side = (m + 0.06).toFixed(3);
  const box =
    Math.ceil(pages) <= 1
      ? `@page{size:letter;margin:0}.paper{width:8.5in!important;padding:${m}in ${side}in!important}`
      : `@page{size:letter;margin:${m}in ${side}in}.paper{width:auto!important;padding:0!important}`;
  return `@media print{${box}}`;
}

/** Proper nouns opt out of `hyphens: auto`, the same way \hyphenation exempts them in the .tex. */
function Keep({ text }: { text: string }) {
  return (
    <>
      {protectParts(text).map((p) => (
        <span key={p.key} style={p.keep ? { hyphens: "manual" } : undefined}>
          {p.text}
        </span>
      ))}
    </>
  );
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {richHtmlParts(text).map((p) =>
        p.bold ? (
          <strong key={p.key}>
            <Keep text={p.text} />
          </strong>
        ) : (
          <Keep key={p.key} text={p.text} />
        )
      )}
    </>
  );
}

export default function Preview({
  db,
  variant,
  onPages,
}: {
  db: DB;
  variant: Variant;
  onPages?: (pages: number) => void;
}) {
  const r = resolve(db, variant);
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pages, setPages] = useState(1);

  const g = gaps(variant.density);
  const m = g.margin;
  const base = variant.fontSize * 1.333;
  const lead = LEAD[variant.fontSize];
  const leadSm = LEAD_SM[variant.fontSize];
  const contentH = PAGE_H - 2 * m * PX_IN;
  // how much preview height fits on one real page — the break markers have to be drawn
  // against this, not against contentH, or they land a page-and-a-bit too high
  const pageH = contentH / CAL;

  useLayoutEffect(() => {
    const fit = () => {
      const w = wrapRef.current?.clientWidth ?? PAGE_W;
      setScale(Math.min(1, (w - 2) / PAGE_W));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const h = paperRef.current?.scrollHeight ?? 0;
    const p = h > 0 ? h / pageH : 0;
    setPages(p);
    onPages?.(p);
  });

  const pageBreaks = Math.max(0, Math.ceil(pages) - 1);

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Print geometry, generated from the same margin the preview uses. `size: letter` stops
          the shrink-to-fit browsers apply when the sheet is wider than the printable area. */}
      <style dangerouslySetInnerHTML={{ __html: printCss(m, pages) }} />
      <div
        className="print-sheet"
        style={{
          width: PAGE_W * scale,
          height: (2 * m * PX_IN + (paperRef.current?.scrollHeight ?? contentH)) * scale,
          margin: "0 auto",
        }}
      >
        <div
          className="paper relative"
          style={{
            width: PAGE_W,
            padding: `${m * PX_IN}px ${(m + 0.06) * PX_IN}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            fontSize: base,
            lineHeight: lead,
            // TeX hyphenates; without this the preview keeps long words whole, runs longer
            // than the compiled page, and breaks lines where LaTeX would not
            hyphens: "auto",
          }}
          lang="en"
        >
          {Array.from({ length: pageBreaks }).map((_, i) => (
            <div
              key={i}
              className="noprint pointer-events-none absolute left-0 right-0 border-t border-dashed"
              style={{ top: m * PX_IN + pageH * (i + 1), borderColor: "#d03b3b88" }}
            >
              <span
                className="absolute right-1 -top-4 text-[10px]"
                style={{ color: "#d03b3b", fontFamily: "system-ui" }}
              >
                page {i + 2}
              </span>
            </div>
          ))}

          <div ref={paperRef}>
            <div className="text-center" style={{ marginBottom: g.header }}>
              <div style={{ fontSize: base * 2.4, fontVariant: "small-caps", lineHeight: 1.05 }}>
                {display(r.name)}
              </div>
              {/* 0.9, not 0.88: the .tex sets this row with \small, which is 9pt on 10pt type */}
              <div style={{ fontSize: base * 0.9, marginTop: 3 }}>
                {/* The .tex sets this row as `item \;$\cdot$\; item`: a full profile URL is one
                    unbreakable box, because TeX will not hyphenate a string carrying slashes and
                    dots, and the only break points are the thin spaces either side of the middot.
                    So each item is nowrap — left to itself the browser splits a URL as
                    "github.com/Hah-" / "haNa" — the middot is glued to the item before it with a
                    non-breaking space, and the ordinary space after it is the one place the line
                    may turn. `\;` is 5mu — 0.278em — and sits either side of the middot on top of
                    those spaces; leaving it out measures ~15pt narrower over three separators,
                    enough to hold a header on one line that LaTeX wraps onto two. */}
                {r.contact.map((c, i) => (
                  <span key={c.field}>
                    <span style={{ whiteSpace: "nowrap" }}>
                      {c.href ? (
                        <a href={c.href} target="_blank" rel="noreferrer" title={c.href}>
                          {c.text}
                        </a>
                      ) : (
                        c.text
                      )}
                      {i < r.contact.length - 1 && (
                        <>
                          {"\u00a0"}
                          <span style={{ margin: "0 0.278em" }}>·</span>
                        </>
                      )}
                    </span>
                    {i < r.contact.length - 1 && " "}
                  </span>
                ))}
              </div>
            </div>

            {r.sections.map((sec, si) => (
              <div key={sec.id} style={{ marginTop: si === 0 ? g.sectionFirst : g.section }}>
                <div
                  className="sec"
                  // lineHeight 1: \titlerule is set -4pt into the heading's own line, so the
                  // border has to ride up against the small caps rather than sit a full
                  // leading below them
                  style={{ fontSize: base * 1.18, lineHeight: 1, paddingBottom: 1 }}
                >
                  {display(sec.title)}
                </div>
                {sec.type === "skills" ? (
                  <div
                    style={{
                      fontSize: base * 0.9,
                      lineHeight: leadSm,
                      marginTop: g.sectionAfter + g.topsep,
                      paddingLeft: CVLIST_INDENT,
                    }}
                  >
                    {sec.skills.map((s) => (
                      <div key={s.id}>
                        <strong>
                          <Rich text={s.label} />
                        </strong>
                        : <Rich text={s.items} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: g.sectionAfter + g.topsep, paddingLeft: CVLIST_INDENT }}>
                    {sec.blocks.map((bk, bi) => (
                      <div
                        key={bk.id}
                        style={{
                          marginTop:
                            bi === 0
                              ? 0
                              : sec.blocks[bi - 1].kind === "award" || sec.blocks[bi - 1].bullets.length
                                ? g.entryAfterBullets
                                : g.entry,
                        }}
                      >
                        {bk.kind === "award" ? (
                          <div className="flex">
                            <div style={{ width: LINE_COL }}>
                              <Rich text={bk.org} />
                              {bk.title && (
                                <span>
                                  {" — "}
                                  <Rich text={bk.title} />
                                </span>
                              )}
                            </div>
                            <div className="flex-1 text-right" style={{ fontSize: base * 0.9 }}>
                              <Keep text={display(bk.period)} />
                            </div>
                          </div>
                        ) : bk.kind === "project" ? (
                          <div className="flex">
                            <div style={{ width: LINE_COL }}>
                              <strong>
                                <Rich text={bk.org} />
                              </strong>
                              {bk.title && (
                                <span style={{ fontSize: base * 0.9 }}>
                                  {" | "}
                                  <em>
                                    <Rich text={bk.title} />
                                  </em>
                                </span>
                              )}
                            </div>
                            <div className="flex-1 text-right" style={{ fontSize: base * 0.9 }}>
                              <Keep text={display(bk.period)} />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex">
                              <strong style={{ width: ENTRY_COL }}>
                                <Rich text={bk.org} />
                              </strong>
                              <div className="flex-1 text-right"><Keep text={display(bk.location)} /></div>
                            </div>
                            <div className="flex" style={{ fontSize: base * 0.9, fontStyle: "italic" }}>
                              <div style={{ width: ENTRY_COL }}>
                                <Rich text={bk.title} />
                              </div>
                              <div className="flex-1 text-right"><Keep text={display(bk.period)} /></div>
                            </div>
                          </>
                        )}
                        {bk.bullets.length > 0 && (
                          <ul
                            style={{
                              fontSize: base * 0.9,
                              lineHeight: leadSm,
                              marginTop: g.topsep,
                              paddingLeft: BULLET_INDENT,
                            }}
                          >
                            {bk.bullets.map((b, i) => (
                              <li
                                key={b.id}
                                style={{ listStyle: "disc", marginTop: i === 0 ? 0 : g.bullet }}
                              >
                                <Rich text={b.text} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

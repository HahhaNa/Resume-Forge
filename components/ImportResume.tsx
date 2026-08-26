"use client";

import { useRef, useState } from "react";
import { useStore, type ImportMode } from "@/lib/store";
import { useT, type K } from "@/lib/i18n";
import { Modal } from "@/components/ui/bits";
import { richHtmlParts } from "@/lib/resume";
import { draftStats, parsePlainText, parseTex, type Draft } from "@/lib/import";

type Phase =
  | { k: "idle" }
  | { k: "busy" }
  | { k: "ready"; draft: Draft; file: string }
  | { k: "error"; msg: string }
  /** Import applied. Held open on purpose so undo is one click, not a hunt. */
  | { k: "done"; mode: ImportMode; entries: number; restorePointId: string; slug: string };

export default function ImportResume({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [drop, setDrop] = useState(false);
  const [paste, setPaste] = useState("");
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const close = () => {
    setPhase({ k: "idle" });
    setPaste("");
    setSkip(new Set());
    onClose();
  };

  const take = async (file: File) => {
    setPhase({ k: "busy" });
    setSkip(new Set());
    try {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      let draft: Draft;
      if (ext === "pdf") {
        const { pdfToLines } = await import("@/lib/pdf");
        const { draftFromLines } = await import("@/lib/import");
        const { lines, links } = await pdfToLines(file);
        draft = draftFromLines(lines, "pdf", links);
      } else if (ext === "docx") {
        const { docxToLines } = await import("@/lib/docx");
        const { draftFromLines } = await import("@/lib/import");
        draft = draftFromLines(await docxToLines(file), "docx");
      } else if (ext === "tex") {
        draft = parseTex(await file.text());
      } else {
        draft = parsePlainText(await file.text());
      }
      setPhase({ k: "ready", draft, file: file.name });
    } catch (e) {
      setPhase({ k: "error", msg: (e as Error).message });
    }
  };

  const takePaste = () => {
    if (!paste.trim()) return;
    const draft = /\\(documentclass|section|begin\{document\})/.test(paste)
      ? parseTex(paste)
      : parsePlainText(paste);
    setSkip(new Set());
    setPhase({ k: "ready", draft, file: "pasted text" });
  };

  /** the draft minus anything the user unchecked in the preview */
  const trim = (draft: Draft): Draft => ({
    ...draft,
    sections: draft.sections
      .filter((_, si) => !skip.has(`s${si}`))
      .map((sec, si) => ({
        ...sec,
        entries: sec.entries
          .filter((_, ei) => !skip.has(`e${si}.${ei}`))
          .map((e, ei) => ({ ...e, bullets: e.bullets.filter((_, bi) => !skip.has(`b${si}.${ei}.${bi}`)) })),
      }))
      .filter((sec) => (sec.type === "skills" ? sec.skills.length : sec.entries.length)),
  });

  /** The variant "Replace /…" is aimed at — the one on screen behind this modal. */
  const active = s.db.variants.find((v) => v.id === s.activeVariantId);

  const run = (mode: ImportMode) => {
    if (phase.k !== "ready") return;
    const draft = trim(phase.draft);
    if (!draft.sections.length) return;
    // only the blunt one asks: retargeting a single variant is one undo away, and the
    // button already says which variant it is about
    if (mode === "replace" && !confirm(t("importReplaceConfirm"))) return;
    const { entries, restorePointId } = s.importDraft(draft, mode, phase.file);
    setPhase({ k: "done", mode, entries, restorePointId, slug: active?.name ?? "" });
  };

  const toggle = (key: string) =>
    setSkip((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Modal open={open} onClose={close} title={t("importResume")} wide>
      {phase.k === "done" ? (
        <div className="space-y-3">
          <div
            className="rounded-xl p-3.5"
            style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-line)" }}
          >
            <div className="text-[13px] font-medium">
              {phase.mode === "replace"
                ? t("importedReplaced")
                : phase.mode === "variant"
                  ? t("importedVariant").replace("{n}", phase.slug)
                  : t("importedAppended")}
            </div>
            <div className="mono mt-1 text-[11px]" style={{ color: "var(--ink2)" }}>
              {phase.entries} {phase.entries === 1 ? "entry" : "entries"}
            </div>
          </div>
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            {t("importUndoNote")}
          </p>
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={() => {
                s.restore(phase.restorePointId);
                close();
              }}
            >
              ↺ {t("undoImport")}
            </button>
            <button className="btn btn-primary" onClick={close}>
              {t("done")}
            </button>
          </div>
        </div>
      ) : phase.k === "ready" ? (
        <Preview
          draft={phase.draft}
          file={phase.file}
          skip={skip}
          toggle={toggle}
          onBack={() => setPhase({ k: "idle" })}
          onRun={run}
          slug={active?.name ?? ""}
          kept={draftStats(trim(phase.draft))}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            {t("importResumeNote")}
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrop(true);
            }}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrop(false);
              const f = e.dataTransfer.files?.[0];
              if (f) take(f);
            }}
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl px-6 py-10 text-center transition"
            style={{
              border: `1.5px dashed ${drop ? "var(--accent)" : "var(--ring)"}`,
              background: drop ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--plane)",
            }}
          >
            <div className="text-[22px]" style={{ color: "var(--muted)" }}>
              ↑
            </div>
            <div className="mt-1 text-[13px] font-medium">
              {phase.k === "busy" ? t("importParsing") : t("importDrop")}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
              .pdf · .docx · .tex · .md · .txt
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            /* dropping a file ignores this list, so anything missing from it is a format the
               picker refuses and the drop zone accepts — keep the two agreeing */
            accept=".pdf,.docx,.tex,.txt,.md,.markdown,.text,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && take(e.target.files[0])}
          />

          <details>
            <summary className="cursor-pointer text-[12px]" style={{ color: "var(--muted)" }}>
              {t("importPaste")}
            </summary>
            <textarea
              className="inp mt-2 resize-y font-mono text-[12px]"
              rows={7}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"\\section{Experience}\n  \\resumeSubheading{…}"}
            />
            <button className="btn btn-sm mt-2" onClick={takePaste} disabled={!paste.trim()}>
              {t("importParse")}
            </button>
          </details>

          {phase.k === "error" && (
            <div className="text-[12px]" style={{ color: "var(--crit)" }}>
              {t("importFailed")}: {phase.msg}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Preview({
  draft,
  file,
  skip,
  toggle,
  onBack,
  onRun,
  slug,
  kept,
}: {
  draft: Draft;
  file: string;
  skip: Set<string>;
  toggle: (k: string) => void;
  onBack: () => void;
  onRun: (mode: ImportMode) => void;
  /** Empty when there is no variant to overwrite — the button hides rather than lying. */
  slug: string;
  kept: { entries: number; bullets: number; skills: number };
}) {
  const t = useT();
  const p = draft.profile;
  /** Everything unticked — there is no import left to apply anywhere. */
  const nothing = !kept.entries && !kept.skills;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--muted)" }}>
        <span className="chip">{file}</span>
        <span className="tabnum">
          {kept.entries} {t("entries")} · {kept.bullets} {t("bullets")} · {kept.skills} {t("skills")}
        </span>
      </div>

      {(p.name || p.email || p.phone || p.linkedin || p.github) && (
        <div className="rounded-lg p-2 text-[12px]" style={{ background: "var(--plane)" }}>
          <span className="lbl">{t("profile")}</span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {[p.name, p.email, p.phone, p.linkedin, p.github].filter(Boolean).map((v, i) => (
              <span key={i}>{v}</span>
            ))}
          </div>
        </div>
      )}

      {draft.warnings.map((w, i) => (
        <div key={i} className="text-[12px]" style={{ color: "var(--warn, var(--muted))" }}>
          ⚠ {t(w as K)}
        </div>
      ))}

      <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
        {draft.sections.map((sec, si) => {
          const secOff = skip.has(`s${si}`);
          return (
            <div key={si} className="rounded-lg p-2" style={{ background: "var(--plane)", opacity: secOff ? 0.45 : 1 }}>
              <label className="flex items-center gap-2 text-[13px] font-medium">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={!secOff}
                  onChange={() => toggle(`s${si}`)}
                />
                {sec.title}
                <span className="chip ml-auto" style={{ color: "var(--muted)" }}>
                  {sec.type === "skills" ? `${sec.skills.length} ${t("skills")}` : `${sec.entries.length} ${t("entries")}`}
                </span>
              </label>

              {sec.type === "skills" ? (
                <ul className="mt-1.5 space-y-0.5 pl-6 text-[12px]">
                  {sec.skills.map((k, ki) => (
                    <li key={ki}>
                      {k.label && <b>{k.label}: </b>}
                      <span style={{ color: "var(--muted)" }}>{k.items}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1.5 space-y-1.5 pl-6">
                  {sec.entries.map((e, ei) => {
                    const off = skip.has(`e${si}.${ei}`);
                    return (
                      <div key={ei} style={{ opacity: off ? 0.45 : 1 }}>
                        <label className="flex items-start gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            className="mt-1 accent-[var(--accent)]"
                            checked={!off}
                            onChange={() => toggle(`e${si}.${ei}`)}
                          />
                          <span className="min-w-0 flex-1">
                            <b>{e.org || t("untitled")}</b>
                            {e.title && <span style={{ color: "var(--muted)" }}> — {e.title}</span>}
                            {(e.period || e.location) && (
                              <span className="ml-1 chip" style={{ color: "var(--muted)" }}>
                                {[e.period, e.location].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </label>
                        <ul className="mt-0.5 space-y-0.5 pl-6 text-[12px]" style={{ color: "var(--muted)" }}>
                          {e.bullets.map((b, bi) => {
                            const boff = skip.has(`b${si}.${ei}.${bi}`);
                            return (
                              <li key={bi} className="flex items-start gap-1.5" style={{ opacity: boff ? 0.4 : 1 }}>
                                <button
                                  className="mt-[1px] shrink-0 rounded px-1 leading-none"
                                  style={{ color: boff ? "var(--accent)" : "var(--crit)", border: "1px solid var(--ring)" }}
                                  title={boff ? t("all") : t("remove")}
                                  onClick={() => toggle(`b${si}.${ei}.${bi}`)}
                                >
                                  {boff ? "+" : "✕"}
                                </button>
                                <span className={boff ? "line-through" : ""}>
                                  {richHtmlParts(b).map((part) =>
                                    part.bold ? <b key={part.key}>{part.text}</b> : <span key={part.key}>{part.text}</span>
                                  )}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Three destinations, ordered by how often they are the right one. Replacing the
          whole library is the rare, blunt case, so it sits apart and reads as the danger it
          is; retargeting the variant you are already on is the common one, so it is primary. */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={onBack}>
          ← {t("importAnother")}
        </button>
        <button
          className="btn ml-auto"
          style={{ color: "var(--crit)" }}
          onClick={() => onRun("replace")}
          disabled={nothing}
        >
          {t("importReplace")}
        </button>
        <button className="btn" onClick={() => onRun("append")} disabled={nothing}>
          {t("importAppend")}
        </button>
        {!!slug && (
          <button
            className="btn btn-primary"
            title={t("importVariantHint").replace(/\{n\}/g, slug)}
            onClick={() => onRun("variant")}
            disabled={nothing}
          >
            {t("importVariant").replace("{n}", slug)}
          </button>
        )}
      </div>
    </div>
  );
}

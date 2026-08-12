"use client";

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Field } from "@/components/ui/bits";
import ImportResume from "@/components/ImportResume";
import type { DB } from "@/lib/types";

export default function DataPage() {
  const s = useStore();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  if (!s.hydrated) return <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading…</div>;
  const p = s.db.profile;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(s.db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `resume-forge-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = (f: File) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const db = JSON.parse(String(rd.result)) as DB;
        if (!db.entries || !db.variants) throw new Error("missing fields");
        s.importDB(db);
        setMsg("Imported.");
      } catch (e) {
        setMsg(`Import failed: ${(e as Error).message}`);
      }
    };
    rd.readAsText(f);
  };

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-3 p-3.5">
      <div className="card p-3.5">
        <div className="mb-1 flex items-center gap-2.5">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("importResume")}</h2>
          <span className="rule" />
        </div>
        <p className="mb-3 text-[12px]" style={{ color: "var(--muted)" }}>
          {t("importResumeNote")}
        </p>
        <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
          ↑ {t("importResume")}
        </button>
      </div>

      <div className="card p-3.5">
        <div className="mb-3 flex items-center gap-2.5">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("profile")}</h2>
          <span className="rule" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t("name")} value={p.name} onChange={(v) => s.patchProfile({ name: v })} />
          <Field label="Headline" value={p.headline} onChange={(v) => s.patchProfile({ headline: v })} />
          <Field label={t("email")} value={p.email} onChange={(v) => s.patchProfile({ email: v })} />
          <Field label={t("phone")} value={p.phone} onChange={(v) => s.patchProfile({ phone: v })} />
          <Field label="LinkedIn" value={p.linkedin} onChange={(v) => s.patchProfile({ linkedin: v })} />
          <Field label="GitHub" value={p.github} onChange={(v) => s.patchProfile({ github: v })} />
          <Field label="Website" value={p.site} onChange={(v) => s.patchProfile({ site: v })} />
          <Field label={t("location")} value={p.location} onChange={(v) => s.patchProfile({ location: v })} />
        </div>
        <div className="mt-3">
          <span className="lbl">{t("language")}</span>
          <div className="flex gap-1.5">
            {(["en", "zh"] as const).map((l) => (
              <button
                key={l}
                className="btn btn-sm"
                onClick={() => s.setLang(l)}
                style={
                  s.lang === l
                    ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" }
                    : undefined
                }
              >
                {l === "en" ? "EN" : "TW"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-3.5">
        <div className="mb-1 flex items-center gap-2.5">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("nav_data")}</h2>
          <span className="rule" />
        </div>
        <p className="mb-3 text-[12px]" style={{ color: "var(--muted)" }}>
          {t("dataNote")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={exportJson}>
            ↓ {t("exportJson")}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ↑ {t("importJson")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
          />
          <button
            className="btn"
            style={{ color: "var(--crit)" }}
            onClick={() => {
              if (confirm(t("resetConfirm"))) {
                s.resetDB();
                setMsg("Reset.");
              }
            }}
          >
            {t("reset")}
          </button>
        </div>
        {msg && (
          <div className="mt-3 text-[12px]" style={{ color: "var(--accent-ink)" }}>
            {msg}
          </div>
        )}
        <div
          className="mono mt-4 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4"
          style={{ color: "var(--faint)" }}
        >
          <div>{s.db.entries.length} entries</div>
          <div>{s.db.entries.reduce((n, e) => n + e.bullets.length, 0)} bullets</div>
          <div>{s.db.variants.length} variants</div>
          <div>{s.db.applications.length} applications</div>
          <div>{s.db.platforms.length} platforms</div>
          <div>{s.db.problems.length} problems</div>
        </div>
      </div>

      <ImportResume open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

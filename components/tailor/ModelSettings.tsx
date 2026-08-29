"use client";

/**
 * Connecting a model, and saying plainly what that means.
 *
 * Two things this panel is careful about. The model list is fetched from the
 * provider rather than hardcoded, because model ids go stale faster than this
 * file gets edited and a stale dropdown is worse than a text box. And "Save &
 * test" is one button rather than two: a key that was saved but never tried is
 * a setting that looks finished and fails later, in the middle of a run.
 */

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  BLANK,
  PROVIDERS,
  baseUrlOf,
  forgetKey,
  listModels,
  loadSettings,
  probe,
  providerOf,
  ready,
  saveSettings,
  type LlmSettings,
  type ProviderKind,
} from "@/lib/llm";
import { Field, IconBtn, Select } from "@/components/ui/bits";

export default function ModelSettings({
  settings,
  onChange,
}: {
  settings: LlmSettings;
  onChange: (s: LlmSettings) => void;
}) {
  const t = useT();
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "list" | "test">("");
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const p = providerOf(settings.kind);

  /* a fetched list belongs to the provider it came from */
  useEffect(() => {
    setModels([]);
    setNote("");
    setBad(false);
  }, [settings.kind, settings.baseUrl]);

  const patch = (v: Partial<LlmSettings>) => onChange({ ...settings, ...v });

  const run = async (what: "list" | "test") => {
    setBusy(what);
    setNote("");
    setBad(false);
    try {
      if (what === "list") {
        const got = await listModels(settings);
        setModels(got);
        if (!got.length) throw new Error("that server lists no models");
        /* a provider that offers exactly what is already typed needs no nudge */
        if (!got.includes(settings.model)) patch({ model: got.includes(p.suggested) ? p.suggested : got[0] });
        setNote(`${got.length} models`);
      } else {
        saveSettings(settings);
        await probe(settings);
        setNote(t("modelOk"));
      }
    } catch (e) {
      setBad(true);
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card p-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <h2 className="text-[13.5px] font-semibold leading-none">{t("modelSetup")}</h2>
        <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
          {t("modelSetupHint")}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px]">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => {
              const next = { ...settings, enabled: e.target.checked };
              onChange(next);
              saveSettings(next);
            }}
          />
          {t("enableModel")}
        </label>
      </div>

      {settings.enabled && (
        <>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Select
              label={t("provider")}
              value={settings.kind}
              onChange={(v) => patch({ kind: v as ProviderKind, model: "", baseUrl: "" })}
              options={PROVIDERS.map((x) => ({ value: x.kind, label: x.label }))}
            />
            <Field
              label={t("baseUrl")}
              value={settings.baseUrl}
              placeholder={p.defaultBaseUrl}
              onChange={(v) => patch({ baseUrl: v })}
            />
          </div>

          {p.needsKey && (
            <div className="mt-2.5">
              <label className="block">
                <span className="lbl">{t("apiKey")}</span>
                <input
                  className="inp"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.apiKey}
                  placeholder="sk-…"
                  onChange={(e) => patch({ apiKey: e.target.value })}
                />
              </label>
              {p.keyUrl && (
                <a
                  className="mono text-[10px] underline"
                  style={{ color: "var(--muted)" }}
                  href={p.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("getKey")} ↗
                </a>
              )}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
            {models.length ? (
              <Select
                className="min-w-[220px] flex-1"
                label={t("modelId")}
                value={settings.model}
                onChange={(v) => patch({ model: v })}
                options={models.map((m) => ({ value: m, label: m }))}
              />
            ) : (
              <Field
                className="min-w-[220px] flex-1"
                label={t("modelId")}
                value={settings.model}
                placeholder={p.suggested}
                onChange={(v) => patch({ model: v })}
              />
            )}
            <IconBtn onClick={() => void run("list")} disabled={!!busy}>
              {busy === "list" ? "…" : t("fetchModels")}
            </IconBtn>
            <IconBtn onClick={() => void run("test")} disabled={!!busy || !ready(settings)}>
              {busy === "test" ? "…" : t("testModel")}
            </IconBtn>
            {(settings.apiKey || settings.model) && (
              <IconBtn
                danger
                title={t("forget")}
                onClick={() => {
                  forgetKey();
                  onChange({ ...BLANK, enabled: true, kind: settings.kind });
                  setModels([]);
                  setNote("");
                }}
              >
                {t("forget")}
              </IconBtn>
            )}
          </div>

          {note && (
            <div className="mono mt-2 text-[10.5px]" style={{ color: bad ? "var(--crit)" : "var(--good)" }}>
              {note}
            </div>
          )}

          <div
            className="mt-3 rounded-[9px] px-2.5 py-2 text-[11.5px] leading-[1.5]"
            style={{ background: "var(--plane)", color: "var(--ink2)" }}
          >
            <div className="mono mb-1 text-[9px] font-medium uppercase tracking-[.14em]" style={{ color: "var(--faint)" }}>
              {t("whatLeaves")}
            </div>
            {p.local ? t("localOnly") : t("whatLeavesBody")}
            <div className="mono mt-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
              {p.note} → {baseUrlOf(settings)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

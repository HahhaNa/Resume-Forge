"use client";

/**
 * The tailoring tab.
 *
 * The shape of this screen follows one rule: never hand back a page without
 * showing the working. A tailored résumé is a set of decisions made on the
 * user's behalf about which parts of their own history to hide, and the only
 * honest way to present that is requirement by requirement — what the posting
 * asked for, which of their lines answered it, and what nothing answered.
 * The gap list is the most useful thing here and it is deliberately not
 * softened: a requirement with no evidence behind it is worth knowing before
 * an interview, not after.
 *
 * Nothing is written to the database until "Create variant" is pressed. Up to
 * then this is a proposal.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { parseJdUrl } from "@/lib/ats";
import { estimatePages } from "@/lib/fit";
import { resolve } from "@/lib/resume";
import { loadSettings, ready, saveSettings, type LlmSettings } from "@/lib/llm";
import { tailor, type Step, type TailorResult } from "@/lib/agent";
import { MAX_JD, type Finding } from "@/lib/untrusted";
import { Bar, Field, Select, Stat, TagChips } from "@/components/ui/bits";
import ModelSettings from "./ModelSettings";

const pct = (n: number) => `${Math.round(n * 100)}%`;

const ODD: Record<Finding["kind"], "oddHidden" | "oddOverride" | "oddRole" | "oddMarkup" | "oddScoring" | "oddLength"> = {
  hidden: "oddHidden",
  override: "oddOverride",
  role: "oddRole",
  markup: "oddMarkup",
  scoring: "oddScoring",
  length: "oddLength",
};

/** 6300 -> "6.3k" — token counts are for a sense of scale, not an invoice. */
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Blue while it fits, amber once it is close, red once it has spilled. */
const fillTone = (fill: number) =>
  fill > 1 ? "var(--crit)" : fill > 0.97 ? "var(--warn)" : "var(--accent)";

export default function Tailor() {
  const s = useStore();
  const t = useT();
  const router = useRouter();

  const [settings, setSettings] = useState<LlmSettings>(() => loadSettings());
  const [jd, setJd] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [baseId, setBaseId] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [out, setOut] = useState<TailorResult | null>(null);
  const [made, setMade] = useState("");
  /* "" is a new application; otherwise the id of the one to file this under */
  const [fileUnder, setFileUnder] = useState("");
  const [newCo, setNewCo] = useState("");
  const [newRole, setNewRole] = useState("");
  const [filed, setFiled] = useState("");

  const guess = useMemo(() => (url.trim() ? parseJdUrl(url) : null), [url]);
  const base = s.db.variants.find((v) => v.id === baseId) ?? s.db.variants.find((v) => v.id === s.activeVariantId) ?? s.db.variants[0];

  const textById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of s.db.entries) for (const b of e.bullets) m.set(b.id, b.text);
    for (const g of s.db.skills) m.set(g.id, `${g.label}: ${g.items}`);
    return m;
  }, [s.db]);

  const orgById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of s.db.entries) for (const b of e.bullets) m.set(b.id, e.org || e.title);
    return m;
  }, [s.db]);

  const run = async () => {
    if (!jd.trim()) {
      setError(t("reqNeeded"));
      return;
    }
    if (!base) return;
    setBusy(true);
    setError("");
    setSteps([]);
    setOut(null);
    setMade("");
    setFiled("");
    saveSettings(settings);
    try {
      const res = await tailor({
        db: s.db,
        base,
        jd,
        settings,
        tags,
        /* a degree is a fact, not a claim that has to earn its line */
        pinnedEntryIds: s.db.entries.filter((e) => e.kind === "education").map((e) => e.id),
        onStep: (st) => setSteps((prev) => [...prev, st]),
      });
      /* 0 requirements means 0 of everything downstream, and the stat tiles
         would report that as "0/0 — all answered", which is a lie with a tick
         next to it */
      if (!res.requirements.length) setError(t("noRequirements"));
      else setOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (!out || !base) return;
    const company = guess?.company || "";
    const role = guess?.role || "";
    const slug =
      (company || role || "role").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) ||
      "role";
    const id = s.addTailoredVariant({
      name: slug,
      label: [company, role].filter(Boolean).join(" · ") || "Tailored",
      note: out.requirements.map((r) => r.text).join("; ").slice(0, 300),
      sections: out.result.sections,
      bulletIds: out.result.bulletIds,
      from: base.id,
    });
    setMade(id);
  };

  const target = s.db.applications.find((a) => a.id === fileUnder);
  const co = newCo.trim() || guess?.company || "";
  const role = newRole.trim() || guess?.role || "";

  /**
   * File the posting under an application.
   *
   * The point of the round trip: a run here is one page for one role and then
   * it is gone, and the question worth asking — what does every posting I
   * applied to keep asking for — can only be asked of postings that were kept.
   * The text is stored, not the link, because the link stops resolving the week
   * the role is filled and nothing here can fetch it back.
   */
  const file = () => {
    /* `sanitise` truncates here anyway — beyond it would be storing bytes
       nothing will ever read */
    const text = jd.slice(0, MAX_JD);
    if (target) {
      s.patchApplication(target.id, {
        jd: text,
        ...(url.trim() && !target.jdUrl ? { jdUrl: url.trim() } : {}),
      });
      setFiled([target.company, target.role].filter(Boolean).join(" · ") || t("newApplication"));
      return;
    }
    s.addApplication({
      company: co,
      role,
      jd: text,
      jdUrl: url.trim(),
      portal: guess?.portal ?? "",
      source: guess?.source ?? "",
      /* the variant this run just produced, when there is one — it is the
         résumé this posting would actually be answered with */
      variantId: made || base?.id || s.activeVariantId,
    });
    setFiled([co, role].filter(Boolean).join(" · ") || t("newApplication"));
  };

  if (!s.hydrated)
    return <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading…</div>;

  /* the packer's own estimate, re-derived from the variant it produced — the
     number the résumé tab will show once this is created */
  const fill = out
    ? estimatePages(
        resolve(s.db, { ...base, sections: out.result.sections, bulletIds: out.result.bulletIds }),
        base
      )
    : 0;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-3 p-3.5">
      <div className="card p-3.5">
        <h1 className="text-[15px] font-semibold leading-none">{t("tailorTitle")}</h1>
        <p className="mt-2 text-[12.5px] leading-[1.55]" style={{ color: "var(--ink2)" }}>
          {t("tailorLead")}
        </p>
      </div>

      <ModelSettings settings={settings} onChange={setSettings} />

      {!ready(settings) && (
        <div
          className="card px-3.5 py-2.5 text-[12px] leading-[1.5]"
          style={{ borderLeft: "2px solid var(--warn)" }}
        >
          <strong>{t("noModel")}</strong>
          <div style={{ color: "var(--ink2)" }}>{t("noModelHint")}</div>
        </div>
      )}

      <div className="card p-3.5">
        <Field label={t("jdUrl")} value={url} onChange={setUrl} type="url" placeholder="https://…" />
        {guess && (guess.company || guess.role || guess.portal) && (
          <div className="mono mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
            {[guess.company, guess.role, guess.portal || guess.source].filter(Boolean).join(" · ")}
          </div>
        )}

        <div className="mt-2.5">
          <Field
            label={t("jdLabel")}
            value={jd}
            onChange={setJd}
            textarea
            rows={10}
            placeholder={t("jdPlaceholder")}
          />
        </div>

        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          <div>
            <Select
              label={t("baseVariant")}
              value={base?.id ?? ""}
              onChange={setBaseId}
              options={s.db.variants.map((v) => ({ value: v.id, label: `${v.label} (${v.name})` }))}
            />
            <div className="mono mt-1 text-[10px]" style={{ color: "var(--faint)" }}>
              {t("baseVariantHint")}
            </div>
          </div>
          <div>
            <span className="lbl">{t("focusTags")}</span>
            <div className="mt-1">
              <TagChips
                tags={tags}
                all={s.db.tags}
                onToggle={(x) => setTags((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]))}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2.5">
          <button className="btn btn-primary" onClick={() => void run()} disabled={busy || !base}>
            {busy ? t("running") : t("runTailor")}
          </button>
          {!!steps.length && (
            <span className="mono text-[10.5px]" style={{ color: "var(--muted)" }}>
              {steps[steps.length - 1].name} — {steps[steps.length - 1].detail}
            </span>
          )}
        </div>

        {error && (
          <div className="mono mt-2 text-[11px]" style={{ color: "var(--crit)" }}>
            {t("tailorFailed")}: {error}
          </div>
        )}
      </div>

      {out && (out.guard.findings.length > 0 || out.guard.distrusted.length > 0) && (
        /* Said out loud rather than handled quietly. The system already refused
           to follow it, but only the user can tell whether a posting that tries
           to give the model orders is a broken scraper or a reason not to
           apply — and they cannot tell if nobody mentions it. */
        <div className="card p-3.5" style={{ borderLeft: "2px solid var(--crit)" }}>
          {out.guard.findings.length > 0 && (
            <>
              <h2 className="text-[13.5px] font-semibold leading-none" style={{ color: "var(--crit)" }}>
                {t("postingOdd")}
              </h2>
              <ul className="mt-2 flex flex-col gap-0.5">
                {out.guard.findings.map((f) => (
                  <li key={`${f.kind}:${f.line}`} className="text-[12px] leading-[1.45]">
                    · {t(ODD[f.kind])}
                    {f.line > 0 && (
                      <span className="mono ml-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
                        {t("atLine")} {f.line}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
                {t("postingOddBody")}
              </p>
            </>
          )}
          {out.guard.distrusted.length > 0 && (
            <p className="mt-2 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
              {out.guard.distrusted.length} {t("judgeDistrusted")}
            </p>
          )}
        </div>
      )}

      {out && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              k={t("onePage")}
              v={pct(fill)}
              sub={<Bar value={fill} max={1} color={fillTone(fill)} height={6} />}
              accent={fillTone(fill)}
            />
            <Stat k={t("chosenLines")} v={out.result.chosen.length} sub={`${out.considered.length} considered`} />
            <Stat
              k={t("requirements")}
              v={`${out.requirements.length - out.gaps.length}/${out.requirements.length}`}
              sub={out.gaps.length ? `${out.gaps.length} unanswered` : "all answered"}
              subTone={out.gaps.length ? "var(--warn)" : "var(--good)"}
            />
          </div>

          <div className="card p-3.5">
            <h2 className="mb-2 text-[13.5px] font-semibold leading-none">{t("requirements")}</h2>
            <div className="flex flex-col gap-2.5">
              {out.requirements.map((r, i) => {
                const ids = out.coverage.get(i) ?? [];
                return (
                  <div key={i} style={{ borderLeft: `2px solid ${ids.length ? "var(--good)" : "var(--warn)"}`, paddingLeft: 9 }}>
                    <div className="text-[12.5px] leading-[1.45]">
                      <span
                        className="mono mr-1.5 text-[9px] uppercase tracking-[.12em]"
                        style={{ color: r.kind === "must" ? "var(--serious)" : "var(--faint)" }}
                      >
                        {t(r.kind === "must" ? "must" : "nice")}
                      </span>
                      {r.text}
                    </div>
                    {ids.length ? (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {ids.map((id) => (
                          <li key={id} className="text-[11.5px] leading-[1.45]" style={{ color: "var(--ink2)" }}>
                            · {textById.get(id) ?? id}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mono mt-1 text-[10.5px]" style={{ color: "var(--warn)" }}>
                        {t("noEvidence")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold leading-none">{t("chosenLines")}</h2>
              <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
                {out.result.chosen.length}
              </span>
              <button className="btn btn-primary btn-sm ml-auto" onClick={create} disabled={!!made}>
                {made ? t("variantMade") : t("createVariant")}
              </button>
              {made && (
                <button className="btn btn-sm" onClick={() => router.push("/")}>
                  →
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {out.judged
                .filter((j) => out.result.chosen.includes(j.doc.id))
                .sort((a, b) => b.score - a.score)
                .map((j) => (
                  <li key={j.doc.id} className="flex gap-2 text-[12px] leading-[1.45]">
                    <span className="mono tabnum shrink-0 text-[10px]" style={{ color: "var(--accent-ink)" }}>
                      {j.score.toFixed(2)}
                    </span>
                    <span>
                      {textById.get(j.doc.id) ?? j.doc.text}
                      {orgById.get(j.doc.id) && (
                        <span className="mono ml-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
                          {orgById.get(j.doc.id)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold leading-none">{t("keepPosting")}</h2>
              <span className="rule" />
            </div>
            <p className="text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
              {t("keepPostingHint")}
            </p>
            <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
              <div className="min-w-[190px] flex-1">
                <Select
                  label={t("attachTo")}
                  value={fileUnder}
                  /* picking a different row is a new question — the last
                     confirmation is no longer about what the button would do */
                  onChange={(v) => {
                    setFileUnder(v);
                    setFiled("");
                  }}
                  options={[
                    { value: "", label: `+ ${t("newApplication")}` },
                    ...s.db.applications.map((a) => ({
                      value: a.id,
                      /* a dot marks the ones already carrying a posting, so
                         "replace" is never a surprise */
                      label: `${a.jd ? "· " : ""}${[a.company || "—", a.role].filter(Boolean).join(" · ")}`,
                    })),
                  ]}
                />
              </div>
              {!target && (
                <>
                  <div className="min-w-[130px] flex-1">
                    <Field label={t("company")} value={newCo} onChange={setNewCo} placeholder={guess?.company} />
                  </div>
                  <div className="min-w-[130px] flex-1">
                    <Field label={t("role")} value={newRole} onChange={setNewRole} placeholder={guess?.role} />
                  </div>
                </>
              )}
              <button
                className="btn btn-primary"
                onClick={file}
                disabled={!!filed || (!target && !co && !role)}
              >
                {target?.jd ? t("replacePosting") : t("attachPosting")}
              </button>
            </div>
            {filed && (
              <div className="mono mt-2 flex items-center gap-2 text-[10.5px]" style={{ color: "var(--good)" }}>
                {t("attachedTo")} {filed}
                <button className="btn btn-sm btn-mono" onClick={() => router.push("/applications")}>
                  {t("openApplications")} →
                </button>
              </div>
            )}
          </div>

          {out.result.dropped.length > 0 && (
            <details className="card p-3.5">
              <summary className="cursor-pointer text-[13.5px] font-semibold leading-none">
                {t("nearMiss")}{" "}
                <span className="mono text-[10px] font-normal" style={{ color: "var(--faint)" }}>
                  {out.result.dropped.length}
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {out.result.dropped.slice(0, 25).map((d) => (
                  <li key={d.id} className="flex gap-2 text-[12px] leading-[1.45]" style={{ color: "var(--ink2)" }}>
                    <span className="mono tabnum shrink-0 text-[10px]" style={{ color: "var(--faint)" }}>
                      {d.score.toFixed(2)}
                    </span>
                    <span>{textById.get(d.id) ?? d.id}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="card p-3.5">
            <summary className="cursor-pointer text-[13.5px] font-semibold leading-none">
              {t("agentLog")}
              {/* the fan-out sends every judge the same corpus, so most of the
                  input is served from the provider's cache — worth showing,
                  because it is the difference between one call's worth of
                  input tokens and one per requirement */}
              {out.usage.calls > 0 && (
                <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--faint)" }}>
                  {out.usage.calls} {t("calls")}
                  {" · "}
                  {short(out.usage.input + out.usage.output)} tok
                  {out.usage.cacheRead > 0 && ` · ${short(out.usage.cacheRead)} ${t("cached")}`}
                </span>
              )}
            </summary>
            <ol className="mono mt-2 flex flex-col gap-1 text-[10.5px]" style={{ color: "var(--muted)" }}>
              {out.steps.map((st, i) => (
                <li key={i}>
                  <span style={{ color: "var(--ink2)" }}>
                    {st.round > 0 ? `${st.round}·` : ""}
                    {st.name}
                  </span>{" "}
                  {st.detail}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </div>
  );
}

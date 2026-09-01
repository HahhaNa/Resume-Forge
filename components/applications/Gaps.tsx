"use client";

/**
 * The applications log, read all at once.
 *
 * Everywhere else on this tab treats an application as a row in a
 * pipeline: where it got to, when it is due, which résumé went out. The
 * postings themselves are the part nobody looks at twice — and taken
 * together they are the only honest description of what the market you
 * are applying into actually asks for. Twenty of them say things about
 * your library that no single one can.
 *
 * Two things about the shape of this.
 *
 * **It is a button, not a render.** One run per posting, each a model
 * fan-out, is real money and a real wait — so it happens when it is
 * asked for, it says how much it is about to cost first, it can be
 * stopped, and every posting's result appears as it lands rather than
 * after the last one. Stopping half way leaves you with half an answer,
 * which is worth more than none.
 *
 * **Each posting is measured against the résumé that application
 * records**, not against one variant chosen here. The question is
 * whether what you actually sent answered what they actually asked, and
 * a row remembers which variant that was.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { loadSettings, ready, type LlmSettings } from "@/lib/llm";
import { addUsage, tailor, NO_USAGE, type Usage } from "@/lib/agent";
import { aggregate, summarise, type PostingRun } from "@/lib/gaps";
import { suggest, worthBuilding, type Suggestion } from "@/lib/suggest";
import { chatModel } from "@/lib/llm";
import { Bar, Stat } from "@/components/ui/bits";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** One `read` and up to twelve judges per posting — enough to warn with. */
const CALLS_EACH = 13;

/** Display only: how completely a posting is answered, at a glance. */
const fitTone = (n: number) => (n >= 0.7 ? "var(--good)" : n >= 0.4 ? "var(--accent)" : "var(--warn)");

/** The rows worth reading are the ones with something to do about them. */
const SHOW = 20;

export default function Gaps() {
  const s = useStore();
  const t = useT();
  const { db } = s;

  const [settings] = useState<LlmSettings>(() => loadSettings());
  const [runs, setRuns] = useState<PostingRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState("");
  const [error, setError] = useState("");
  const [odd, setOdd] = useState(0);
  const [offline, setOffline] = useState(false);
  const [usage, setUsage] = useState<Usage>(NO_USAGE);
  const [ideas, setIdeas] = useState<Suggestion[]>([]);
  const [thinking, setThinking] = useState(false);
  /* a ref, not state: the loop has to see the change on its next turn, and a
     re-render is not what stops it */
  const halt = useRef(false);

  const kept = useMemo(() => db.applications.filter((a) => a.jd.trim()), [db.applications]);
  const missing = db.applications.length - kept.length;
  const agg = useMemo(() => aggregate(runs), [runs]);
  const acted = agg.themes.filter((th) => th.missing > 0 || th.inLibrary > 0);
  const buildable = useMemo(() => worthBuilding(agg.themes), [agg.themes]);
  const answered = agg.themes.length - acted.length;

  /* asked for rather than rendered, like the read above it: this is another
     model call, and the gap list it builds on is already the useful output */
  const propose = async () => {
    if (!buildable.length || !ready(settings)) return;
    setThinking(true);
    setError("");
    try {
      const model = await chatModel(settings);
      const { suggestions, usage: u } = await suggest({ themes: agg.themes, db, model, kind: settings.kind });
      setIdeas(suggestions);
      setUsage((prev) => addUsage(prev, u));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(false);
    }
  };

  const read = async () => {
    if (!kept.length) return;
    setBusy(true);
    setError("");
    setRuns([]);
    setIdeas([]);
    setOdd(0);
    setOffline(false);
    setUsage(NO_USAGE);
    halt.current = false;
    const done: PostingRun[] = [];
    let odds = 0;
    let total = NO_USAGE;
    try {
      for (const a of kept) {
        if (halt.current) break;
        setNow([a.company, a.role].filter(Boolean).join(" · ") || a.id);
        const base =
          db.variants.find((v) => v.id === a.variantId) ??
          db.variants.find((v) => v.id === s.activeVariantId) ??
          db.variants[0];
        if (!base) break;
        const res = await tailor({
          db,
          base,
          jd: a.jd,
          settings,
          /* a degree is a fact, not a claim that has to earn its line — the
             same rule the Tailor tab runs under */
          pinnedEntryIds: db.entries.filter((e) => e.kind === "education").map((e) => e.id),
        });
        done.push(summarise(a, res));
        total = addUsage(total, res.usage);
        if (res.guard.findings.length || res.guard.distrusted.length) odds++;
        if (res.offline) setOffline(true);
        /* published per posting: a stopped run still shows what it read */
        setRuns([...done]);
        setOdd(odds);
        setUsage(total);
      }
    } catch (e) {
      /* a rejected key fails every remaining posting the same way, so there is
         nothing to gain by carrying on — but what was already read still counts */
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setNow("");
    }
  };

  return (
    <>
      <div className="card p-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("acrossTitle")}</h2>
          <span
            className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
            style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
          >
            {kept.length}
          </span>
          <span className="rule" />
        </div>
        <p className="text-[12.5px] leading-[1.55]" style={{ color: "var(--ink2)" }}>
          {t("acrossLead")}
        </p>

        {kept.length === 0 ? (
          <div className="mt-3 rounded-[11px] p-3" style={{ background: "var(--sunken)" }}>
            <div className="text-[12.5px]" style={{ color: "var(--ink2)" }}>
              {t("noPostings")}
            </div>
            <div className="mt-1 text-[11.5px] leading-[1.5]" style={{ color: "var(--muted)" }}>
              {t("noPostingsHint")}
            </div>
            <Link href="/tailor" className="btn btn-sm btn-mono mt-2 inline-block">
              {t("nav_tailor")} →
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button className="btn btn-primary" onClick={() => void read()} disabled={busy}>
              {t("readAll")}
            </button>
            {busy && (
              <>
                <span className="mono text-[10.5px]" style={{ color: "var(--muted)" }}>
                  {t("readingPosting")} {runs.length + 1}/{kept.length} — {now}
                </span>
                <button className="btn btn-sm btn-mono" onClick={() => (halt.current = true)}>
                  {t("stopReading")}
                </button>
              </>
            )}
            {/* said before it is spent, not after */}
            {!busy && ready(settings) && (
              <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
                {t("modelCallsAbout")} {kept.length * CALLS_EACH} {t("calls")}
              </span>
            )}
            {!busy && usage.calls > 0 && (
              <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
                {usage.calls} {t("calls")} · {short(usage.input + usage.output)} tok
                {usage.cacheRead > 0 && ` · ${short(usage.cacheRead)} ${t("cached")}`}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mono mt-2 text-[11px]" style={{ color: "var(--crit)" }}>
            {t("analysisStopped")} {error}
          </div>
        )}
        {!busy && offline && agg.postings > 0 && (
          <div className="mono mt-2 text-[10.5px]" style={{ color: "var(--warn)" }}>
            {t("keywordOnly")}
          </div>
        )}
        {odd > 0 && (
          <div className="mono mt-2 text-[10.5px]" style={{ color: "var(--crit)" }}>
            {odd} {t("postingsOdd")}
          </div>
        )}
      </div>

      {agg.postings > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            <Stat
              k={t("postingsRead")}
              v={agg.postings}
              sub={missing ? `${missing} ${t("withoutPosting")}` : `${agg.requirements} requirements`}
              subTone={missing ? "var(--warn)" : undefined}
            />
            <Stat
              k={t("keepFailing")}
              v={agg.themes.filter((th) => th.missing > 0).length}
              sub={`${agg.themes.length} distinct asks`}
              accent="var(--crit)"
            />
            <Stat
              k={t("alreadyFit")}
              v={agg.fits[0] ? pct(agg.fits[0].score) : "—"}
              sub={agg.fits[0]?.company || " "}
              accent={agg.fits[0] ? fitTone(agg.fits[0].score) : undefined}
            />
          </div>

          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold leading-none">{t("keepFailing")}</h2>
              <span className="rule" />
            </div>
            <p className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
              {t("keepFailingHint")}
            </p>
            {acted.length === 0 ? (
              <div className="py-3 text-[13px]" style={{ color: "var(--muted)" }}>
                —
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {acted.slice(0, SHOW).map((th) => (
                  <div
                    key={th.id}
                    style={{
                      borderLeft: `2px solid ${th.missing ? "var(--crit)" : "var(--warn)"}`,
                      paddingLeft: 9,
                    }}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[12.5px] leading-[1.45]">{th.label}</span>
                      <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
                        {th.asked}/{agg.postings}
                      </span>
                      {th.missingMusts > 0 && (
                        <span
                          className="mono text-[9px] uppercase tracking-[.12em]"
                          style={{ color: "var(--serious)" }}
                        >
                          {t("must")}
                        </span>
                      )}
                    </div>
                    <div className="mono mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px]">
                      {th.missing > 0 && (
                        <span style={{ color: "var(--crit)" }}>
                          {th.missing} · {t("themeMissing")}
                        </span>
                      )}
                      {th.inLibrary > 0 && (
                        <span style={{ color: "var(--warn)" }}>
                          {th.inLibrary} · {t("themeLibrary")}
                        </span>
                      )}
                      {th.onPage > 0 && (
                        <span style={{ color: "var(--good)" }}>
                          {th.onPage} · {t("themeOnPage")}
                        </span>
                      )}
                    </div>
                    {/* who saw the hole — the reason this is worth acting on */}
                    <div className="mt-1 truncate text-[11px]" style={{ color: "var(--muted)" }}>
                      {th.hits
                        .filter((h) => h.answer !== "page")
                        .map((h) => h.company || h.role || "—")
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(acted.length > SHOW || answered > 0) && (
              <div className="mono mt-3 flex flex-wrap gap-x-3 text-[10.5px]" style={{ color: "var(--faint)" }}>
                {acted.length > SHOW && <span>+{acted.length - SHOW} {t("moreAsks")}</span>}
                {answered > 0 && (
                  <span>
                    {answered} {t("themesAnswered")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold leading-none">{t("alreadyFit")}</h2>
              <span className="rule" />
            </div>
            <p className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
              {t("alreadyFitHint")}
            </p>
            <div className="grid grid-cols-[minmax(96px,1.2fr)_1fr_78px] items-center gap-x-2.5 gap-y-[9px]">
              {agg.fits.map((f) => (
                <div key={f.appId} className="contents">
                  <span className="truncate text-[12px]" title={`${f.company} · ${f.role}`}>
                    {f.company || "—"}
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      {f.role}
                    </span>
                  </span>
                  <Bar
                    value={f.score}
                    max={1}
                    color={fitTone(f.score)}
                    height={7}
                    tip={`${f.answered}/${f.total} answered · ${f.mustsAnswered}/${f.musts} required`}
                  />
                  <span className="mono tabnum text-right text-[11px]" style={{ color: "var(--ink2)" }}>
                    {pct(f.score)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* The gap list says what you keep failing. This says what to do about
              it — and the number beside each project is counted from the hits
              already on this page, not asked of the model, because "this would
              unlock 6 applications" is exactly the kind of confident figure that
              is wrong and unfalsifiable. */}
          <div className="card p-3.5">
            <div className="mb-2 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold leading-none">{t("buildNext")}</h2>
              <span className="rule" />
              {ready(settings) ? (
                <button
                  className="btn btn-sm shrink-0"
                  onClick={propose}
                  disabled={thinking || !buildable.length}
                >
                  {thinking ? t("buildThinking") : t("buildAsk")}
                </button>
              ) : (
                <span className="text-[11px] shrink-0" style={{ color: "var(--faint)" }}>
                  {t("buildNeedsModel")}
                </span>
              )}
            </div>
            <p className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink2)" }}>
              {buildable.length ? t("buildNextHint") : t("buildNothing")}
            </p>

            <ul className="flex flex-col gap-2.5">
              {ideas.map((idea) => (
                <li key={idea.title} className="border-l-2 pl-2.5" style={{ borderColor: "var(--accent)" }}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12.5px] font-semibold">{idea.title}</span>
                    <span className="mono tabnum text-[10px]" style={{ color: "var(--accent-ink)" }}>
                      {idea.postings} {t("buildPayoff")}
                      {idea.musts > 0 && ` · ${idea.musts} ${t("buildRequired")}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-[1.45]">{idea.what}</p>
                  <p className="mt-0.5 text-[11.5px] leading-[1.45]" style={{ color: "var(--ink2)" }}>
                    {idea.why}
                  </p>
                  <p className="mt-1 text-[10.5px] leading-[1.4]" style={{ color: "var(--faint)" }}>
                    {t("buildCloses")}: {idea.themes.map((th) => th.label).join(" · ")}
                  </p>
                  {/* the count above, spelled out. A number nobody can trace back
                      to a row on this page is a number nobody should trust */}
                  <p className="mt-0.5 text-[10.5px] leading-[1.4]" style={{ color: "var(--faint)" }}>
                    {idea.helps.map((a) => a.company || a.role || "—").join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

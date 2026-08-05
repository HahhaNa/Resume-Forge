"use client";

import { useMemo, useState } from "react";
import { useStore, today } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { CLOSED } from "@/lib/types";
import type { Platform, Problem } from "@/lib/types";
import { byRef, isDeepMl, refFromUrl, search, toProblem, useDeepMlCatalog } from "@/lib/deepml";
import type { CatalogItem } from "@/lib/deepml";
import { Bar, Dot, Field, IconBtn, Modal, Select, Stat } from "@/components/ui/bits";

const SERIES = ["s1", "s2", "s3", "s4", "s5", "s6"];
const DIFF_COLOR: Record<string, string> = {
  easy: "var(--good)",
  medium: "var(--warn)",
  hard: "var(--crit)",
  "": "var(--muted)",
};

/** One day of the activity strip. color-mix keeps the ramp readable in both themes. */
function heat(n: number, max: number) {
  const f = max > 0 ? n / max : 0;
  return {
    height: Math.max(4, Math.round(6 + f * 28)),
    background: n === 0 ? "var(--track)" : `color-mix(in oklab, var(--accent) ${Math.round(22 + f * 78)}%, var(--track))`,
  };
}

const dayList = (n: number) => {
  const out: string[] = [];
  const d = new Date(today() + "T00:00:00");
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
};

export default function PracticePage() {
  const s = useStore();
  const t = useT();
  const { db } = s;
  const [editPlatform, setEditPlatform] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [fPlatform, setFPlatform] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState({ platformId: "", ref: "", title: "", difficulty: "", topics: "" });
  const [manual, setManual] = useState(false);

  const quickPlatformId = quick.platformId || db.platforms[0]?.id || "";
  const catalogued = isDeepMl(db.platforms.find((p) => p.id === quickPlatformId));

  const solved = db.problems.filter((p) => p.status === "solved");
  const due = db.problems.filter((p) => p.nextReviewAt && p.nextReviewAt <= today() && p.status !== "todo");
  const inReview = db.problems.filter((p) => p.status === "review").length;
  const days = dayList(30);
  const perDay = days.map((d) => db.problems.filter((p) => p.solvedAt === d).length);
  const maxDay = Math.max(1, ...perDay);
  const activeDays = perDay.filter((x) => x > 0).length;

  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of solved) for (const tp of p.topics) m.set(tp, (m.get(tp) ?? 0) + 1);
    return m;
  }, [solved]);

  const neededTopics = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const a of db.applications) {
      if (CLOSED.includes(a.status)) continue;
      for (const tp of a.prepTopics) {
        const arr = m.get(tp) ?? [];
        if (!arr.includes(a.company)) arr.push(a.company);
        m.set(tp, arr);
      }
    }
    return [...m.entries()]
      .map(([topic, companies]) => ({ topic, companies, solved: topicCounts.get(topic) ?? 0 }))
      .sort((a, b) => a.solved - b.solved || b.companies.length - a.companies.length);
  }, [db.applications, topicCounts]);

  const rows = db.problems.filter(
    (p) =>
      (!fPlatform || p.platformId === fPlatform) &&
      (!fStatus || p.status === fStatus) &&
      (!q || [p.title, p.ref, p.topics.join(" ")].join(" ").toLowerCase().includes(q.toLowerCase()))
  );

  const platformName = (id: string) => db.platforms.find((x) => x.id === id)?.name ?? "—";

  const addQuick = () => {
    if (!quick.title && !quick.ref) return;
    s.addProblem({
      platformId: quickPlatformId,
      ref: quick.ref,
      title: quick.title,
      difficulty: quick.difficulty as Problem["difficulty"],
      topics: quick.topics.split(",").map((x) => x.trim()).filter(Boolean),
    });
    setQuick({ ...quick, ref: "", title: "", topics: "" });
  };

  if (!s.hydrated) return <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading…</div>;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 p-3.5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat k={t("solved")} v={solved.length} sub={`${db.problems.length} tracked`} />
        <Stat
          k={t("dueToday")}
          v={due.length}
          sub={`${inReview} in review`}
          accent={due.length > 0 ? "var(--accent)" : undefined}
        />
        <Stat k={t("streak")} v={`${activeDays}/30`} sub={t("last30")} />
        <Stat
          k={t("difficulty")}
          v={
            <span className="text-[20px]">
              {(["easy", "medium", "hard"] as const).map((d, i) => (
                <span key={d} style={{ color: DIFF_COLOR[d] }}>
                  {i > 0 && <span style={{ color: "var(--faint)" }}> / </span>}
                  {solved.filter((p) => p.difficulty === d).length}
                </span>
              ))}
            </span>
          }
          sub="easy / medium / hard"
        />
      </div>

      {/* platforms */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 px-[3px]">
          <h2 className="text-[14.5px] font-semibold leading-none">{t("platforms")}</h2>
          <span
            className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
            style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
          >
            {db.platforms.length}
          </span>
          <span className="rule" style={{ background: "var(--axis)" }} />
          <button className="btn btn-sm btn-mono" onClick={() => setEditPlatform(s.addPlatform())}>
            + {t("addPlatform")}
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {db.platforms.map((p, i) => {
            const n = db.problems.filter((x) => x.platformId === p.id && x.status === "solved").length;
            const color = `var(--${SERIES.includes(p.color) ? p.color : SERIES[i % SERIES.length]})`;
            return (
              <div key={p.id} className="group card px-[13px] py-3">
                <div className="flex items-center gap-[7px]">
                  <Dot color={color} size={8} />
                  <span className="truncate text-[13px] font-semibold">{p.name}</span>
                  <span className="flex-1" />
                  <span className="mono tabnum text-[11px]" style={{ color: "var(--ink2)" }}>
                    {n}
                    {p.target > 0 && <span style={{ color: "var(--faint)" }}> / {p.target}</span>}
                  </span>
                </div>
                <div className="mt-2.5">
                  <Bar value={n} max={Math.max(1, p.target || n)} color={color} height={6} tip={`${n} / ${p.target || "—"}`} />
                </div>
                <div className="mono mt-[9px] flex items-center gap-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
                  <span>{p.kind}</span>
                  <span className="flex-1" />
                  <span className="opacity-0 transition group-hover:opacity-100">
                    <IconBtn onClick={() => setEditPlatform(p.id)}>✎</IconBtn>
                  </span>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className="text-[10.5px]" style={{ color: "var(--accent-ink)" }}>
                      open ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* activity */}
        <div className="card p-3.5">
          <div className="mb-[11px] flex items-baseline gap-2.5">
            <h2 className="text-[13.5px] font-semibold leading-none">{t("last30")}</h2>
            <span className="flex-1" />
            <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
              {activeDays} / 30 active
            </span>
          </div>
          <div className="flex h-[34px] items-end gap-[3px]">
            {perDay.map((n, i) => {
              const h = heat(n, maxDay);
              return (
                <span
                  key={i}
                  title={`${days[i]} · ${n}`}
                  className="flex-1 rounded-[2px]"
                  style={{ height: h.height, background: h.background }}
                />
              );
            })}
          </div>
          <div className="mono mt-2 flex justify-between text-[9.5px]" style={{ color: "var(--faint)" }}>
            <span>{days[0]}</span>
            <span>{days[days.length - 1]}</span>
          </div>
        </div>

        {/* topic gaps */}
        <div className="card p-3.5">
          <div className="mb-1 flex items-baseline gap-2.5">
            <h2 className="text-[13.5px] font-semibold leading-none">{t("gapVsTargets")}</h2>
            <span className="flex-1" />
            <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
              {neededTopics.length} topics
            </span>
          </div>
          <p className="mb-3 text-[11px]" style={{ color: "var(--muted)" }}>
            Topics you listed on active applications, ranked by how little you have practiced them.
          </p>
          {neededTopics.length === 0 ? (
            <div className="py-3 text-[12px]" style={{ color: "var(--muted)" }}>
              Add “{t("prepTopics")}” on an application to see gaps here.
            </div>
          ) : (
            <div className="grid max-h-[190px] grid-cols-[104px_1fr_28px] items-center gap-x-2.5 gap-y-[9px] overflow-y-auto pr-1">
              {neededTopics.map((x) => (
                <div key={x.topic} className="contents">
                  <span className="truncate text-[11.5px]" title={x.companies.join(", ")} style={{ color: "var(--ink2)" }}>
                    {x.topic}
                  </span>
                  <Bar
                    value={Math.max(x.solved, 0.12)}
                    max={Math.max(5, ...neededTopics.map((y) => y.solved))}
                    color={x.solved === 0 ? "var(--crit)" : x.solved < 3 ? "var(--warn)" : "var(--tw)"}
                    height={7}
                    tip={`${x.solved} solved · needed by ${x.companies.join(", ")}`}
                  />
                  <span className="mono tabnum text-right text-[11px]" style={{ color: "var(--ink2)" }}>
                    {x.solved}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* review queue */}
      {due.length > 0 && (
        <div className="card p-3.5">
          <div className="mb-3 flex items-center gap-2.5">
            <h2 className="text-[13.5px] font-semibold leading-none">{t("dueToday")}</h2>
            <span
              className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
              style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
            >
              {due.length}
            </span>
            <span className="rule" />
          </div>
          <div className="flex flex-col gap-2">
            {due.slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2.5 rounded-[11px] px-2.5 py-2"
                style={{ background: "var(--sunken)" }}
              >
                <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
                  {platformName(p.platformId)}
                </span>
                <span className="text-[12.5px] font-medium">
                  <span className="mono mr-1.5 tabnum" style={{ color: "var(--muted)" }}>
                    {p.ref}
                  </span>
                  {p.title}
                </span>
                <span className="ml-auto flex gap-1">
                  {([1, 2, 3, 5] as const).map((c, i) => (
                    <button key={c} className="btn btn-sm" onClick={() => s.gradeProblem(p.id, c)}>
                      {[t("again"), t("hard"), t("good"), t("easy")][i]}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* problems */}
      <div className="card p-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("problems")}</h2>
          <span
            className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
            style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
          >
            {rows.length}
          </span>
          <input className="inp max-w-[200px]" placeholder={`${t("search")}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="inp max-w-[150px]" value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}>
            <option value="">{t("platforms")}: {t("all")}</option>
            {db.platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className="inp max-w-[130px]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">{t("status")}: {t("all")}</option>
            <option value="solved">{t("solved")}</option>
            <option value="todo">{t("todo")}</option>
            <option value="review">{t("review")}</option>
          </select>
          <button className="btn btn-sm ml-auto" onClick={() => setBulk(true)}>
            Bulk paste
          </button>
        </div>

        {/* quick add row — Deep-ML swaps the four boxes for one search box */}
        <div className="mb-3 flex flex-wrap items-start gap-2 rounded-[11px] p-2" style={{ background: "var(--sunken)" }}>
          <select
            className="inp max-w-[150px]"
            value={quickPlatformId}
            onChange={(e) => setQuick({ ...quick, platformId: e.target.value })}
          >
            {db.platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {catalogued && !manual ? (
            <DeepMlPicker platformId={quickPlatformId} onManual={() => setManual(true)} />
          ) : (
            <>
              <input className="inp max-w-[90px]" placeholder="ref" value={quick.ref} onChange={(e) => setQuick({ ...quick, ref: e.target.value })} />
              <input
                className="inp min-w-[180px] flex-1"
                placeholder="title"
                value={quick.title}
                onChange={(e) => setQuick({ ...quick, title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addQuick()}
              />
              <select className="inp max-w-[110px]" value={quick.difficulty} onChange={(e) => setQuick({ ...quick, difficulty: e.target.value })}>
                <option value="">{t("difficulty")}</option>
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
              <input
                className="inp max-w-[180px]"
                placeholder="topics, comma"
                value={quick.topics}
                onChange={(e) => setQuick({ ...quick, topics: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addQuick()}
              />
              <button className="btn btn-primary" onClick={addQuick}>
                + {t("addProblem")}
              </button>
              {catalogued && (
                <button className="btn btn-sm btn-mono" onClick={() => setManual(false)} title="back to catalogue search">
                  ↩ search
                </button>
              )}
            </>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="py-6 text-center text-[13px]" style={{ color: "var(--muted)" }}>
            —
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0" style={{ background: "var(--surface)" }}>
                <tr style={{ color: "var(--faint)", borderBottom: "1px solid var(--ring)" }}>
                  {["", t("problems"), t("difficulty"), t("topics"), t("status"), t("solved"), t("review"), ""].map((h, i) => (
                    <th
                      key={i}
                      className="mono whitespace-nowrap px-2 py-2 text-left text-[9.5px] font-medium uppercase tracking-[.14em]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--grid)" }}>
                    <td className="mono px-2 py-1.5 text-[10.5px]" style={{ color: "var(--faint)" }}>
                      {platformName(p.platformId)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="mono tabnum mr-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                        {p.ref}
                      </span>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
                          {p.title}
                        </a>
                      ) : (
                        p.title
                      )}
                    </td>
                    <td className="mono px-2 py-1.5 text-[11px]" style={{ color: DIFF_COLOR[p.difficulty] }}>
                      {p.difficulty || "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex flex-wrap gap-1">
                        {p.topics.map((tp) => (
                          <span key={tp} className="chip">
                            {tp}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="mono rounded-md px-1.5 py-0.5 text-[10.5px]"
                        style={{ background: "var(--chip)", border: "1px solid transparent", color: "var(--ink2)" }}
                        value={p.status}
                        onChange={(e) => s.patchProblem(p.id, { status: e.target.value as Problem["status"] })}
                      >
                        <option value="todo">{t("todo")}</option>
                        <option value="solved">{t("solved")}</option>
                        <option value="review">{t("review")}</option>
                      </select>
                    </td>
                    <td className="mono tabnum px-2 py-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      {p.solvedAt || "—"}
                    </td>
                    <td
                      className="mono tabnum px-2 py-1.5 text-[11px]"
                      style={{ color: p.nextReviewAt && p.nextReviewAt <= today() ? "var(--crit)" : "var(--muted)" }}
                    >
                      {p.nextReviewAt || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <IconBtn danger onClick={() => s.removeProblem(p.id)}>
                        ✕
                      </IconBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlatformModal id={editPlatform} onClose={() => setEditPlatform(null)} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} />
    </div>
  );
}

/** Four catalogues share one picker, so each row says which one it came from. */
const KIND_LABEL: Record<string, string> = {
  problem: "problem",
  step: "step",
  math: "math",
  lab: "lab",
};

/**
 * Deep-ML serves its whole problem list from an open endpoint, so logging a
 * solve is one search box: type an id or a few words of the title, hit Enter,
 * and the ref, title, URL, difficulty and category all come from the source.
 *
 * The fetch is deliberately a button rather than an on-mount effect — this app
 * makes no network calls unless you ask it to, and that should stay true.
 */
function DeepMlPicker({ platformId, onManual }: { platformId: string; onManual: () => void }) {
  const s = useStore();
  const t = useT();
  const { items, syncedAt, state, error, progress, sync } = useDeepMlCatalog();
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);

  const hits = useMemo(() => search(items, q), [items, q]);
  const already = useMemo(
    () => new Set(s.db.problems.filter((p) => p.platformId === platformId).map((p) => p.ref)),
    [s.db.problems, platformId]
  );

  const pick = (x?: CatalogItem) => {
    if (!x || already.has(x.ref)) return;
    s.addProblem(toProblem(x, platformId));
    setQ("");
    setHi(0);
  };

  if (!items.length) {
    return (
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <button className="btn btn-primary disabled:opacity-40" onClick={sync} disabled={state === "loading"}>
          {state === "loading" ? `${t("syncing")} ${progress}` : `↓ ${t("syncCatalog")}`}
        </button>
        <span className="text-[11.5px]" style={{ color: state === "error" ? "var(--crit)" : "var(--muted)" }}>
          {state === "error" ? `${t("syncFailed")} — ${error}` : t("catalogEmpty")}
        </span>
        <button className="btn btn-sm btn-mono ml-auto" onClick={onManual}>
          {t("addProblem")} →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="relative min-w-[240px] flex-1">
        <input
          className="inp"
          placeholder={`${items.length} ${t("catalogReady")}`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          /* let a click on a row land before the list unmounts */
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((i) => Math.min(i + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              pick(hits[hi]);
            } else if (e.key === "Escape") {
              setQ("");
              setOpen(false);
            }
          }}
        />
        {open && hits.length > 0 && (
          <ul
            className="card absolute left-0 right-0 top-full z-30 mt-1 max-h-[300px] overflow-y-auto p-1"
            style={{ boxShadow: "var(--lift-3)" }}
          >
            {hits.map((x, i) => {
              const dup = already.has(x.ref);
              return (
                <li key={x.ref}>
                  <button
                    className="flex w-full items-baseline gap-2 rounded-[8px] px-2 py-1.5 text-left transition"
                    style={{
                      background: i === hi ? "var(--chip-hover)" : "transparent",
                      opacity: dup ? 0.45 : 1,
                      cursor: dup ? "default" : "pointer",
                    }}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => pick(x)}
                    title={x.url}
                  >
                    <span className="mono tabnum w-[42px] shrink-0 text-[10.5px]" style={{ color: "var(--faint)" }}>
                      {x.short}
                    </span>
                    <span className="flex-1 truncate text-[12.5px]">
                      {/* a step is meaningless without the project it belongs to */}
                      {x.parent && (
                        <span style={{ color: "var(--muted)" }}>{x.parent} · </span>
                      )}
                      {x.title}
                      {x.premium && (
                        <span className="mono ml-1.5 text-[9.5px]" style={{ color: "var(--warn)" }}>
                          pro
                        </span>
                      )}
                    </span>
                    <span className="mono shrink-0 text-[9.5px]" style={{ color: "var(--faint)" }}>
                      {KIND_LABEL[x.kind]}
                    </span>
                    <span
                      className="mono shrink-0 text-[10px]"
                      style={{ color: DIFF_COLOR[x.difficulty] }}
                    >
                      {x.difficulty || "—"}
                    </span>
                    <span className="mono shrink-0 truncate text-[10px]" style={{ color: "var(--faint)", maxWidth: 140 }}>
                      {dup ? "✓ added" : x.category}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <button
        className="btn btn-sm btn-mono disabled:opacity-40"
        onClick={sync}
        disabled={state === "loading"}
        title={
          state === "error"
            ? `${t("syncFailed")} — ${error}`
            : syncedAt
              ? `synced ${syncedAt.slice(0, 16).replace("T", " ")}`
              : ""
        }
        style={state === "error" ? { color: "var(--crit)" } : undefined}
      >
        {state === "loading" ? `… ${progress}` : "↻"} {state === "loading" ? "" : items.length}
      </button>
      <button className="btn btn-sm btn-mono" onClick={onManual}>
        manual
      </button>
    </div>
  );
}

function PlatformModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useStore();
  const t = useT();
  const p = s.db.platforms.find((x) => x.id === id);
  if (!p) return null;
  const patch = (x: Partial<Platform>) => s.patchPlatform(p.id, x);
  return (
    <Modal open onClose={onClose} title={p.name}>
      <div className="space-y-3">
        <Field label="Name" value={p.name} onChange={(v) => patch({ name: v })} />
        <Field label="URL" value={p.url} onChange={(v) => patch({ url: v })} />
        <div className="grid grid-cols-3 gap-2">
          <Select
            label="Kind"
            value={p.kind}
            onChange={(v) => patch({ kind: v as Platform["kind"] })}
            options={["algorithms", "ml", "hardware", "systems", "other"].map((x) => ({ value: x, label: x }))}
          />
          <Field label={t("target")} value={String(p.target)} onChange={(v) => patch({ target: Number(v) || 0 })} />
          <Select
            label="Color"
            value={p.color}
            onChange={(v) => patch({ color: v })}
            options={SERIES.map((x, i) => ({ value: x, label: `slot ${i + 1}` }))}
          />
        </div>
        <div className="flex gap-1.5">
          {SERIES.map((x) => (
            <button
              key={x}
              onClick={() => patch({ color: x })}
              className="h-6 w-6 rounded-md transition"
              style={{
                background: `var(--${x})`,
                outline: p.color === x ? "2px solid var(--ink)" : "none",
                outlineOffset: 2,
              }}
              title={x}
            />
          ))}
        </div>
        <button className="btn" style={{ color: "var(--crit)" }} onClick={() => { s.removePlatform(p.id); onClose(); }}>
          {t("remove")}
        </button>
      </div>
    </Modal>
  );
}

function BulkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [text, setText] = useState("");
  const [platformId, setPlatformId] = useState(s.db.platforms[0]?.id ?? "");
  const { items } = useDeepMlCatalog();
  const catalogued = isDeepMl(s.db.platforms.find((p) => p.id === platformId)) && items.length > 0;

  const parse = () => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      /* on Deep-ML a bare ref or a pasted link is enough — the catalogue fills the rest in */
      const hit = catalogued && !l.includes("|") ? byRef(items, refFromUrl(l) ?? l) : undefined;
      if (hit) {
        s.addProblem(toProblem(hit, platformId));
        continue;
      }
      const [ref, title, difficulty, topics] = l.split("|").map((x) => (x ?? "").trim());
      s.addProblem({
        platformId,
        ref: ref ?? "",
        title: title ?? ref ?? "",
        difficulty: (["easy", "medium", "hard"].includes(difficulty) ? difficulty : "") as Problem["difficulty"],
        topics: (topics ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      });
    }
    setText("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Bulk paste" wide>
      <p className="mb-2 text-[12px]" style={{ color: "var(--muted)" }}>
        One problem per line: <code className="mono">ref | title | difficulty | topic, topic</code>. Difficulty and topics
        are optional.
        {catalogued && (
          <>
            {" "}
            On Deep-ML a bare problem id on its own line is enough — the rest is filled from the catalogue.
          </>
        )}
      </p>
      <select className="inp mb-2 max-w-[220px]" value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
        {s.db.platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <textarea
        className="inp mono text-[12px]"
        rows={12}
        value={text}
        placeholder={"208 | Implement Trie | medium | trie, design\n207 | Course Schedule | medium | graph, topological sort"}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn btn-primary mt-3" onClick={parse}>
        Import
      </button>
    </Modal>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, today } from "@/lib/store";
import { useT, useStatusLabel, STATUS_LABEL } from "@/lib/i18n";
import { buildTex } from "@/lib/resume";
import { parseJdUrl } from "@/lib/ats";
import { APP_STATUSES, CLOSED, FUNNEL } from "@/lib/types";
import type { AppStatus, Application } from "@/lib/types";
import { Bar, Dot, Field, hue, hueOf, IconBtn, Modal, Select, Stat } from "@/components/ui/bits";

/* the funnel borrows the four variant hues, so a stage reads the same colour everywhere */
const STAGE_HUE = ["var(--accent)", "var(--t3)", "var(--t2)", "var(--t4)"];
const tone = (s: string) => `var(--${STATUS_LABEL[s]?.tone ?? "muted"})`;

function daysTo(d: string) {
  if (!d) return null;
  const ms = new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

export default function ApplicationsPage() {
  const s = useStore();
  const t = useT();
  const sl = useStatusLabel();
  const { db } = s;
  const [edit, setEdit] = useState<string | null>(null);
  const [snap, setSnap] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fVariant, setFVariant] = useState("");

  const apps = db.applications;
  const submitted = apps.filter((a) => a.status !== "saved");
  const reachedIdx = (st: AppStatus) => APP_STATUSES.indexOf(st);
  const funnel = FUNNEL.map((st) => ({
    stage: st,
    n:
      st === "applied"
        ? submitted.length
        : apps.filter((a) => !CLOSED.includes(a.status) && reachedIdx(a.status) >= reachedIdx(st)).length,
  }));
  const responded = submitted.filter((a) => !["applied", "ghosted"].includes(a.status)).length;
  const saved = apps.filter((a) => a.status === "saved").length;
  const interviewing = apps.filter((a) => a.status === "interview").length;
  const closed = apps.filter((a) => CLOSED.includes(a.status)).length;
  const last30 = submitted.filter((a) => {
    const d = daysTo(a.appliedAt);
    return d !== null && d >= -30 && d <= 0;
  }).length;

  const byVariant = db.variants.map((v, i) => ({
    v,
    h: hueOf(v.name, i, db.tags),
    sent: submitted.filter((a) => a.variantId === v.id).length,
    adv: apps.filter((a) => a.variantId === v.id && ["oa", "interview", "offer"].includes(a.status)).length,
  }));
  const vmax = Math.max(1, ...byVariant.map((x) => x.sent));

  const upcoming = useMemo(() => {
    const out: { d: number; when: string; a: Application; what: string }[] = [];
    for (const a of apps) {
      if (CLOSED.includes(a.status)) continue;
      const d1 = daysTo(a.deadline);
      if (d1 !== null && d1 >= -7 && d1 <= 60) out.push({ d: d1, when: a.deadline, a, what: t("deadline") });
      const d2 = daysTo(a.nextActionAt);
      if (d2 !== null && d2 >= -7 && d2 <= 60)
        out.push({ d: d2, when: a.nextActionAt, a, what: a.nextAction || t("nextAction") });
    }
    return out.sort((x, y) => x.d - y.d).slice(0, 8);
  }, [apps, t]);

  const rows = apps.filter(
    (a) =>
      (!fStatus || a.status === fStatus) &&
      (!fVariant || a.variantId === fVariant) &&
      (!q ||
        [a.company, a.role, a.team, a.notes, a.referral].join(" ").toLowerCase().includes(q.toLowerCase()))
  );

  if (!s.hydrated) return <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading…</div>;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 p-3.5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <Stat k={t("total")} v={apps.length} sub={`${saved} saved`} />
        <Stat k={t("applied")} v={submitted.length} sub={`${last30} in 30d`} />
        <Stat
          k={t("active")}
          v={apps.filter((a) => ["applied", "oa", "interview"].includes(a.status)).length}
          sub={`${interviewing} interviewing`}
          accent="var(--accent)"
        />
        <Stat k={t("offers")} v={apps.filter((a) => a.status === "offer").length} sub={`${closed} closed`} />
        <Stat
          k={t("responseRate")}
          v={submitted.length ? `${Math.round((responded / submitted.length) * 100)}%` : "—"}
          sub={`${responded} of ${submitted.length} replied`}
          subTone={responded > 0 ? "var(--good)" : undefined}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-3.5">
          <div className="mb-3 flex items-center gap-2.5">
            <h2 className="text-[13.5px] font-semibold leading-none">{t("funnel")}</h2>
            <span className="rule" />
            <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
              {apps.length} tracked
            </span>
          </div>
          <div className="grid grid-cols-[76px_1fr_28px] items-center gap-x-2.5 gap-y-[9px]">
            {funnel.map((f, i) => (
              <div key={f.stage} className="contents">
                <span className="truncate text-[11.5px]" style={{ color: "var(--ink2)" }}>
                  {sl(f.stage)}
                </span>
                <Bar value={f.n} max={Math.max(1, funnel[0].n)} color={STAGE_HUE[i]} tip={`${sl(f.stage)}: ${f.n}`} />
                <span className="mono tabnum text-right text-[11px] font-medium">{f.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-3.5">
          <div className="mb-3 flex items-center gap-2.5">
            <h2 className="text-[13.5px] font-semibold leading-none">{t("byVariant")}</h2>
            <span className="rule" />
            <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
              sent / reached OA+
            </span>
          </div>
          <div className="grid grid-cols-[76px_1fr_46px] items-center gap-x-2.5 gap-y-[9px]">
            {byVariant.map((x) => (
              <div key={x.v.id} className="contents">
                <span className="mono flex items-center gap-1.5 truncate text-[11px]" title={x.v.label}>
                  <Dot color={hue(x.h)} />
                  <span className="truncate" style={{ color: "var(--ink2)" }}>
                    /{x.v.name}
                  </span>
                </span>
                <div className="space-y-[3px]">
                  <Bar value={x.sent} max={vmax} color={hue(x.h)} height={7} tip={`${x.v.name}: ${x.sent} applied`} />
                  <Bar
                    value={x.adv}
                    max={vmax}
                    color={hue(x.h, "line")}
                    height={7}
                    tip={`${x.v.name}: ${x.adv} reached OA+`}
                  />
                </div>
                <span className="mono tabnum text-right text-[11px]" style={{ color: "var(--ink2)" }}>
                  {x.sent}/{x.adv}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-3.5">
        <div className="mb-2 flex items-center gap-2.5">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("upcoming")}</h2>
          <span className="rule" />
          <span className="mono text-[10px]" style={{ color: "var(--faint)" }}>
            next 60 days
          </span>
        </div>
        {upcoming.length === 0 ? (
          <div className="py-3 text-[13px]" style={{ color: "var(--muted)" }}>
            —
          </div>
        ) : (
          <ul>
            {upcoming.map((u, i) => (
              <li
                key={i}
                className="flex items-baseline gap-3 py-[7px] text-[13px]"
                style={{ borderBottom: i < upcoming.length - 1 ? "1px solid var(--grid)" : "none" }}
              >
                <span
                  className="mono tabnum w-16 shrink-0 text-[11px]"
                  style={{ color: u.d <= 7 ? "var(--crit)" : "var(--muted)", fontWeight: u.d <= 7 ? 500 : 400 }}
                >
                  {u.d < 0 ? `${-u.d}d ago` : u.d === 0 ? "today" : `in ${u.d}d`}
                </span>
                <span className="font-medium">{u.a.company}</span>
                <span className="truncate text-[12px]" style={{ color: "var(--ink2)" }}>
                  {u.what} · {u.a.role}
                </span>
                <span className="mono ml-auto shrink-0 text-[10.5px]" style={{ color: "var(--faint)" }}>
                  {u.when}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-3.5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[13.5px] font-semibold leading-none">{t("nav_apps")}</h2>
          <span
            className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
            style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
          >
            {rows.length}
          </span>
          <input className="inp max-w-[220px]" placeholder={`${t("search")}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="inp max-w-[150px]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">{t("status")}: {t("all")}</option>
            {APP_STATUSES.map((x) => (
              <option key={x} value={x}>
                {sl(x)}
              </option>
            ))}
          </select>
          <select className="inp max-w-[150px]" value={fVariant} onChange={(e) => setFVariant(e.target.value)}>
            <option value="">{t("resumeUsed")}: {t("all")}</option>
            {db.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm btn-mono ml-auto" onClick={() => setEdit(s.addApplication({}))}>
            + {t("newApplication")}
          </button>
        </div>

        <QuickAdd />

        {rows.length === 0 ? (
          <div className="py-6 text-center text-[13px]" style={{ color: "var(--muted)" }}>
            {t("noApps")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ color: "var(--faint)", borderBottom: "1px solid var(--ring)" }}>
                  {[t("company"), t("role"), t("resumeUsed"), t("status"), t("applied"), t("deadline"), t("snapshot"), ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="mono whitespace-nowrap px-2 py-2 text-left text-[9.5px] font-medium uppercase tracking-[.14em]"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const vi = db.variants.findIndex((v) => v.id === a.variantId);
                  const v = db.variants[vi];
                  return (
                    <tr
                      key={a.id}
                      className="row-dbl"
                      title={t("dblEdit")}
                      /* double-click anywhere in the row opens the same form as ✎ — but the
                         controls inside the row keep their own behaviour, and the word the
                         second click selected is dropped so it isn't left highlighted behind
                         the modal. */
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest("a, button, select, input")) return;
                        window.getSelection()?.removeAllRanges();
                        setEdit(a.id);
                      }}
                      style={{ borderBottom: "1px solid var(--grid)" }}
                    >
                      <td className="px-2 py-2 font-semibold">
                        {a.jdUrl ? (
                          <a href={a.jdUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
                            {a.company || "—"}
                          </a>
                        ) : (
                          a.company || "—"
                        )}
                        {a.team && (
                          <div className="text-[11px] font-normal" style={{ color: "var(--muted)" }}>
                            {a.team}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--ink2)" }}>
                        {a.role || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {v ? (
                          <span className="mono inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ink2)" }}>
                            <Dot color={hue(hueOf(v.name, vi, db.tags))} />/{v.name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="mono rounded-md px-1.5 py-0.5 text-[10.5px]"
                          style={{
                            color: tone(a.status),
                            background: "var(--chip)",
                            border: "1px solid transparent",
                          }}
                          value={a.status}
                          onChange={(e) => s.patchApplication(a.id, { status: e.target.value as AppStatus })}
                        >
                          {APP_STATUSES.map((x) => (
                            <option key={x} value={x}>
                              {STATUS_LABEL[x].glyph} {sl(x)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="mono tabnum px-2 py-2 text-[11px]" style={{ color: "var(--muted)" }}>
                        {a.appliedAt || "—"}
                      </td>
                      <td className="mono tabnum px-2 py-2 text-[11px]" style={{ color: "var(--muted)" }}>
                        {a.deadline || "—"}
                      </td>
                      <td className="px-2 py-2">
                        {a.snapshot ? (
                          <button className="btn btn-sm btn-mono" onClick={() => setSnap(a.id)}>
                            {a.snapshot.builtAt.slice(0, 10)} · {a.snapshot.bulletIds.length}
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-mono"
                            onClick={() => {
                              const target = db.variants.find((x) => x.id === a.variantId);
                              if (!target) return;
                              s.patchApplication(a.id, {
                                snapshot: {
                                  builtAt: new Date().toISOString(),
                                  variantName: target.name,
                                  bulletIds: [...target.bulletIds],
                                  tex: buildTex(db, target),
                                },
                              });
                            }}
                          >
                            🔒 {t("takeSnapshot")}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <IconBtn onClick={() => setEdit(a.id)}>✎</IconBtn>
                        <IconBtn danger onClick={() => s.removeApplication(a.id)}>
                          ✕
                        </IconBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AppModal id={edit} onClose={() => setEdit(null)} />
      <SnapModal id={snap} onClose={() => setSnap(null)} />
    </div>
  );
}

/**
 * One row, two required boxes, Enter to file it — the same shape as the
 * practice tab's quick add. The full form is still there behind ✎ for the
 * day you want to fill in the portal and the referral; most days you don't.
 *
 * Pasting the job link first is the fast path: the company, the ATS and
 * often the role fall straight out of the URL.
 */
function QuickAdd() {
  const s = useStore();
  const t = useT();
  const sl = useStatusLabel();
  const { db } = s;
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [variantId, setVariantId] = useState("");
  const [status, setStatus] = useState<AppStatus>("applied");
  /* once you type over a guessed value, the link stops overwriting it */
  const typedCompany = useRef(false);
  const typedRole = useRef(false);

  const guess = useMemo(() => (url.trim() ? parseJdUrl(url) : null), [url]);

  useEffect(() => {
    if (guess?.company && !typedCompany.current) setCompany(guess.company);
    if (guess?.role && !typedRole.current) setRole(guess.role);
  }, [guess]);

  const add = () => {
    const co = company.trim();
    const rl = role.trim();
    if (!co && !rl) return;
    s.addApplication({
      company: co,
      role: rl,
      status,
      variantId: variantId || s.activeVariantId,
      jdUrl: url.trim(),
      portal: guess?.portal ?? "",
      source: guess?.source ?? "",
    });
    setUrl("");
    setCompany("");
    setRole("");
    typedCompany.current = false;
    typedRole.current = false;
  };

  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && add();
  const badge = [guess?.portal, guess?.source].filter(Boolean).join(" · ");

  return (
    <div className="mb-3 rounded-[11px] p-2" style={{ background: "var(--sunken)" }}>
      <div className="flex flex-wrap gap-2">
        <input
          className="inp mono min-w-[190px] flex-[2] text-[11.5px]"
          placeholder={`${t("jdUrlHint")} ↓`}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onEnter}
        />
        <input
          className="inp min-w-[130px] flex-1"
          placeholder={t("company")}
          value={company}
          onChange={(e) => {
            typedCompany.current = true;
            setCompany(e.target.value);
          }}
          onKeyDown={onEnter}
        />
        <input
          className="inp min-w-[150px] flex-[1.4]"
          placeholder={t("role")}
          value={role}
          onChange={(e) => {
            typedRole.current = true;
            setRole(e.target.value);
          }}
          onKeyDown={onEnter}
        />
        <select
          className="inp max-w-[110px]"
          value={variantId || s.activeVariantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          {db.variants.map((v) => (
            <option key={v.id} value={v.id}>
              /{v.name}
            </option>
          ))}
        </select>
        <select
          className="inp max-w-[120px]"
          value={status}
          onChange={(e) => setStatus(e.target.value as AppStatus)}
        >
          {APP_STATUSES.map((x) => (
            <option key={x} value={x}>
              {STATUS_LABEL[x].glyph} {sl(x)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary disabled:opacity-40"
          onClick={add}
          disabled={!company.trim() && !role.trim()}
        >
          + {t("quickAdd")}
        </button>
      </div>
      {badge && (
        <div className="mono mt-1.5 px-1 text-[10px]" style={{ color: "var(--faint)" }}>
          {badge} · {t("detected")}
        </div>
      )}
    </div>
  );
}

function AppModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useStore();
  const t = useT();
  const sl = useStatusLabel();
  const [more, setMore] = useState(false);
  /* a fresh application reopens folded, however you left the last one */
  useEffect(() => setMore(false), [id]);

  /* every value you have already used, offered back as autocomplete */
  const seen = useMemo(() => {
    const pick = (f: (x: Application) => string) =>
      [...new Set(s.db.applications.map(f).filter(Boolean))].sort();
    return {
      company: pick((x) => x.company),
      team: pick((x) => x.team),
      location: pick((x) => x.location),
      region: pick((x) => x.region),
      source: pick((x) => x.source),
      portal: pick((x) => x.portal),
      referral: pick((x) => x.referral),
    };
  }, [s.db.applications]);

  const a = s.db.applications.find((x) => x.id === id);
  if (!a) return null;
  const p = (patch: Partial<Application>) => s.patchApplication(a.id, patch);
  return (
    <Modal open onClose={onClose} title={a.company || t("newApplication")} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("company")} value={a.company} onChange={(v) => p({ company: v })} suggest={seen.company} />
        <Field label={t("role")} value={a.role} onChange={(v) => p({ role: v })} />
        <Select
          label={t("status")}
          value={a.status}
          onChange={(v) => p({ status: v as AppStatus })}
          options={APP_STATUSES.map((x) => ({ value: x, label: sl(x) }))}
        />
        <Select
          label={t("resumeUsed")}
          value={a.variantId}
          onChange={(v) => p({ variantId: v })}
          options={s.db.variants.map((v) => ({ value: v.id, label: `${v.name} — ${v.label}` }))}
        />
        <Field label={t("applied")} value={a.appliedAt} onChange={(v) => p({ appliedAt: v })} type="date" />
        <Field label={t("deadline")} value={a.deadline} onChange={(v) => p({ deadline: v })} type="date" />
        <Field label="JD URL" value={a.jdUrl} onChange={(v) => p({ jdUrl: v })} type="url" className="md:col-span-2" />
      </div>

      <div className="my-3 flex items-center gap-2.5">
        <button className="btn btn-sm btn-mono" onClick={() => setMore(!more)}>
          {more ? "▴" : "▾"} {more ? t("fewerDetails") : t("moreDetails")}
        </button>
        <span className="rule" />
      </div>

      {more && (
        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <Field label={t("team")} value={a.team} onChange={(v) => p({ team: v })} suggest={seen.team} />
          <Field label={t("location")} value={a.location} onChange={(v) => p({ location: v })} suggest={seen.location} />
          <Field
            label={t("region")}
            value={a.region}
            onChange={(v) => p({ region: v })}
            suggest={seen.region}
          />
          <Field label={t("source")} value={a.source} onChange={(v) => p({ source: v })} suggest={seen.source} />
          <Field label={t("portal")} value={a.portal} onChange={(v) => p({ portal: v })} suggest={seen.portal} />
          <Field label={t("referral")} value={a.referral} onChange={(v) => p({ referral: v })} suggest={seen.referral} />
          <Field label={t("nextAction")} value={a.nextAction} onChange={(v) => p({ nextAction: v })} />
          <Field
            label={`${t("nextAction")} — date`}
            value={a.nextActionAt}
            onChange={(v) => p({ nextActionAt: v })}
            type="date"
          />
        </div>
      )}

      <div className="grid gap-3">
        <Field
          label={t("prepTopics")}
          value={a.prepTopics.join(", ")}
          onChange={(v) => p({ prepTopics: v.split(",").map((x) => x.trim()).filter(Boolean) })}
          placeholder="graphs, dp, verilog fsm"
        />
        <Field label={t("notes")} value={a.notes} onChange={(v) => p({ notes: v })} textarea />
      </div>
      {a.events.length > 0 && (
        <div className="mono mt-4 flex flex-wrap gap-3 text-[11px]" style={{ color: "var(--muted)" }}>
          {a.events.map((e, i) => (
            <span key={i}>
              {e.at} → {sl(e.status)}
            </span>
          ))}
        </div>
      )}
    </Modal>
  );
}

function SnapModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useStore();
  const a = s.db.applications.find((x) => x.id === id);
  if (!a?.snapshot) return null;
  return (
    <Modal open onClose={onClose} title={`${a.company} — snapshot`} wide>
      <div className="mono mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--muted)" }}>
        <span>variant: /{a.snapshot.variantName}</span>
        <span>· built: {a.snapshot.builtAt.slice(0, 16).replace("T", " ")}</span>
        <span>· {a.snapshot.bulletIds.length} bullets</span>
        <button
          className="btn btn-sm btn-mono ml-auto"
          onClick={() => {
            const blob = new Blob([a.snapshot!.tex], { type: "text/x-tex" });
            const el = document.createElement("a");
            el.href = URL.createObjectURL(blob);
            el.download = `${a.company.replace(/\W/g, "")}_${a.snapshot!.variantName}.tex`;
            el.click();
            URL.revokeObjectURL(el.href);
          }}
        >
          ↓ .tex
        </button>
        <button
          className="btn btn-sm btn-mono"
          style={{ color: "var(--crit)" }}
          onClick={() => s.patchApplication(a.id, { snapshot: undefined })}
        >
          unlock
        </button>
      </div>
      <pre
        className="mono max-h-[55vh] overflow-auto rounded-[11px] p-3 text-[11px] leading-snug"
        style={{ background: "var(--sunken)", color: "var(--ink2)" }}
      >
        {a.snapshot.tex}
      </pre>
    </Modal>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import EntryModal from "@/components/resume/EntryModal";
import { Dot, hue, hueOf, IconBtn, TagChips } from "@/components/ui/bits";
import {
  ALL_TAGS,
  KINDS,
  KIND_ABBR,
  KIND_SECTION,
  entryHue,
  entryUse,
  isInVariant,
  needsBullets,
} from "@/lib/library";
import type { Entry, EntryKind, Variant } from "@/lib/types";

type Filter = "all" | "gaps" | "unused";

/* ------------------------------------------------------------------ *
 * cells
 * ------------------------------------------------------------------ */

/** One entry × one variant: how much of it that résumé renders, and the switch. */
function EntryCell({
  h,
  inVariant,
  used,
  total,
  kind,
  onClick,
  title,
  label,
}: {
  h: string;
  inVariant: boolean;
  used: number;
  total: number;
  kind: EntryKind;
  onClick: () => void;
  title: string;
  /** skill groups have no bullets to count — they are simply in or out */
  label?: string;
}) {
  // in the section but with nothing ticked, `resolve` drops it — say so rather than lie
  const dark = inVariant && total > 0 && used === 0 && needsBullets(kind);
  return (
    <button
      onClick={onClick}
      title={title}
      className="mono tabnum mx-auto grid h-[26px] w-[54px] place-items-center rounded-[8px] text-[10.5px] transition"
      style={
        inVariant
          ? {
              background: dark ? "transparent" : hue(h, "tint"),
              border: `1px solid ${dark ? "var(--warn)" : hue(h, "line")}`,
              color: dark ? "var(--warn)" : hue(h, "ink"),
              fontWeight: 500,
            }
          : {
              background: "transparent",
              border: "1px dashed var(--axis)",
              color: "var(--faint)",
            }
      }
    >
      {inVariant ? (label ?? `${used}/${total}`) : "+"}
    </button>
  );
}

/** One bullet × one variant. Ghosted when the variant does not carry the entry at all. */
function BulletCell({
  h,
  on,
  ghost,
  onClick,
  title,
}: {
  h: string;
  on: boolean;
  ghost: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className="mx-auto grid h-[15px] w-[15px] place-items-center rounded-[5px] text-[9px] font-semibold leading-none transition"
      style={{
        background: on ? hue(h) : "var(--surface)",
        border: `1.5px solid ${on ? hue(h) : "var(--ring)"}`,
        color: "#fff",
        opacity: ghost ? 0.4 : 1,
      }}
    >
      {on ? "✓" : ""}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * page
 * ------------------------------------------------------------------ */

export default function LibraryPage() {
  const s = useStore();
  const t = useT();
  const { db } = s;
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editEntry, setEditEntry] = useState<string | null>(null);

  const hues = useMemo(
    () => Object.fromEntries(db.variants.map((v, i) => [v.id, hueOf(v.name, i)])),
    [db.variants]
  );

  if (!s.hydrated)
    return (
      <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>
        Loading…
      </div>
    );

  const nv = db.variants.length;
  const needle = q.trim().toLowerCase();

  const matches = (e: Entry) => {
    if (tag && !e.tags.includes(tag) && !e.bullets.some((b) => b.tags.includes(tag))) return false;
    if (needle) {
      const hay = [e.org, e.title, e.period, e.location, ...e.bullets.map((b) => b.text)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    const used = db.variants.filter((v) => isInVariant(v, e.id)).length;
    if (filter === "unused") return used === 0;
    if (filter === "gaps") return used < nv;
    return true;
  };

  const shown = db.entries.filter(matches);
  const shownSkills = db.skills.filter(
    (sk) =>
      (!tag || sk.tags.includes(tag)) &&
      (!needle || `${sk.label} ${sk.items}`.toLowerCase().includes(needle))
  );

  const missing = db.entries.filter((e) => db.variants.some((v) => !isInVariant(v, e.id))).length;
  const orphans = db.entries.filter((e) => db.variants.every((v) => !isInVariant(v, e.id))).length;

  /** Entries a variant renders — the whitelist can outlive a deleted bullet or section. */
  const variantTotals = (v: Variant) => {
    const on = new Set(v.bulletIds);
    const ids = new Set(v.sections.flatMap((sec) => sec.ids));
    const entries = db.entries.filter(
      (e) => ids.has(e.id) && (!needsBullets(e.kind) || e.bullets.some((b) => on.has(b.id)))
    );
    const bullets = entries.reduce((n, e) => n + e.bullets.filter((b) => on.has(b.id)).length, 0);
    return { entries: entries.length, bullets };
  };

  const newEntry = (kind: EntryKind) => {
    const id = s.addEntry({ kind, org: "New entry" });
    setEditEntry(id);
  };

  const colCount = 1 + nv + 1;

  return (
    <div className="mx-auto flex max-w-[1700px] flex-col gap-3.5 p-3.5">
      {/* ---------- header ---------- */}
      <div className="card p-3.5">
        <div className="mb-[11px] flex flex-wrap items-center gap-2.5">
          <span className="lbl mb-0">{t("nav_library")}</span>
          <span className="rule" />
          <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
            {db.entries.length} {t("entries").toLowerCase()} · {db.skills.length}{" "}
            {t("skills").toLowerCase()} · {nv} {t("variants").toLowerCase()}
          </span>
        </div>
        <p className="max-w-[80ch] text-[12.5px] leading-[1.55]" style={{ color: "var(--ink2)" }}>
          {t("libNote")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-[10px] px-[11px] py-[7px]"
            style={{ background: "var(--sunken)", border: "1px solid var(--grid)" }}
          >
            <span className="text-[13px]" style={{ color: "var(--faint)" }}>
              ⌕
            </span>
            <input
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              placeholder={`${t("search")}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="mono text-[11px]" style={{ color: "var(--muted)" }} onClick={() => setQ("")}>
                ✕
              </button>
            )}
          </div>

          <TagChips
            tags={tag ? [tag] : []}
            all={ALL_TAGS}
            onToggle={(x) => setTag(tag === x ? null : x)}
          />

          <div className="flex gap-1">
            {(
              [
                ["all", `${t("all")} · ${db.entries.length}`],
                ["gaps", `${t("filterGaps")} · ${missing}`],
                ["unused", `${t("filterUnused")} · ${orphans}`],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm btn-mono${filter === k ? " btn-primary" : ""}`}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- the matrix ---------- */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 px-[13px] py-2.5 text-[11px] font-medium"
                style={{
                  background: "var(--surface)",
                  borderBottom: "1px solid var(--axis)",
                  minWidth: 360,
                  color: "var(--muted)",
                }}
              >
                {t("entries")} / {t("bullets")}
              </th>
              {db.variants.map((v) => (
                <th
                  key={v.id}
                  className="px-1.5 py-2.5 align-bottom"
                  style={{ borderBottom: "1px solid var(--axis)", minWidth: 76 }}
                >
                  <button
                    className="flex w-full flex-col items-center gap-1"
                    title={t("editVariantHint")}
                    onClick={() => s.setActiveVariant(v.id)}
                  >
                    <span className="flex items-center gap-1">
                      <Dot color={hue(hues[v.id])} />
                      <span
                        className="max-w-[86px] truncate text-[11.5px] font-semibold"
                        style={{ color: s.activeVariantId === v.id ? "var(--ink)" : "var(--ink2)" }}
                      >
                        {v.label}
                      </span>
                    </span>
                    <span className="mono text-[10px]" style={{ color: hue(hues[v.id], "ink") }}>
                      /{v.name}
                    </span>
                  </button>
                </th>
              ))}
              <th style={{ borderBottom: "1px solid var(--axis)", width: 92 }} />
            </tr>
          </thead>

          <tbody>
            {KINDS.map((kind) => {
              const group = shown.filter((e) => e.kind === kind);
              return (
                <GroupRows
                  key={kind}
                  kind={kind}
                  group={group}
                  colCount={colCount}
                  hues={hues}
                  open={open}
                  setOpen={setOpen}
                  onEdit={setEditEntry}
                  onNew={newEntry}
                />
              );
            })}

            {/* ---------- skills ---------- */}
            <tr>
              <td
                colSpan={colCount}
                className="sticky left-0 px-[13px] pb-1.5 pt-4"
                style={{ background: "var(--surface)" }}
              >
                <span className="flex items-center gap-2.5">
                  <span className="text-[12.5px] font-semibold">{t("skills")}</span>
                  <span
                    className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
                    style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
                  >
                    {shownSkills.length}
                  </span>
                  <button className="btn btn-sm btn-mono" onClick={() => s.addSkill()}>
                    + {t("skills")}
                  </button>
                </span>
              </td>
            </tr>
            {shownSkills.map((sk) => (
              <tr key={sk.id} className="group">
                <td
                  className="sticky left-0 z-10 px-[13px] py-2"
                  style={{ background: "var(--surface)", borderTop: "1px solid var(--grid)" }}
                >
                  <input
                    className="w-full bg-transparent text-[12.5px] font-semibold outline-none"
                    value={sk.label}
                    onChange={(e) => s.patchSkill(sk.id, { label: e.target.value })}
                  />
                  <input
                    className="w-full bg-transparent text-[11.5px] outline-none"
                    style={{ color: "var(--muted)" }}
                    value={sk.items}
                    onChange={(e) => s.patchSkill(sk.id, { items: e.target.value })}
                  />
                </td>
                {db.variants.map((v) => {
                  const on = isInVariant(v, sk.id);
                  return (
                    <td key={v.id} className="px-1.5 py-2" style={{ borderTop: "1px solid var(--grid)" }}>
                      <EntryCell
                        h={hues[v.id]}
                        inVariant={on}
                        used={1}
                        total={1}
                        label="✓"
                        kind="education"
                        title={on ? t("clickRemove") : t("clickAdd")}
                        onClick={() => s.setSkillInVariant(v.id, sk.id, !on)}
                      />
                    </td>
                  );
                })}
                <td className="px-1.5 py-2" style={{ borderTop: "1px solid var(--grid)" }}>
                  <div className="flex justify-end opacity-0 transition group-hover:opacity-100">
                    <IconBtn title={t("addEverywhere")} onClick={() => s.setSkillEverywhere(sk.id, true)}>
                      ⊕
                    </IconBtn>
                    <IconBtn title={t("removeEverywhere")} onClick={() => s.setSkillEverywhere(sk.id, false)}>
                      ⊖
                    </IconBtn>
                    <IconBtn danger title={t("remove")} onClick={() => s.removeSkill(sk.id)}>
                      ✕
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>

          {/* ---------- totals ---------- */}
          <tfoot>
            <tr>
              <td
                className="sticky left-0 z-10 px-[13px] py-2.5"
                style={{ background: "var(--surface)", borderTop: "1px solid var(--axis)" }}
              >
                <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
                  {t("renders")}
                </span>
              </td>
              {db.variants.map((v) => {
                const tot = variantTotals(v);
                return (
                  <td
                    key={v.id}
                    className="px-1.5 py-2.5 text-center"
                    style={{ borderTop: "1px solid var(--axis)" }}
                  >
                    <div className="mono tabnum text-[11px]" style={{ color: "var(--ink2)" }}>
                      {tot.entries}
                    </div>
                    <div className="mono tabnum text-[10px]" style={{ color: "var(--faint)" }}>
                      {tot.bullets} {t("bullets")}
                    </div>
                  </td>
                );
              })}
              <td style={{ borderTop: "1px solid var(--axis)" }} />
            </tr>
          </tfoot>
        </table>
      </div>

      <EntryModal entryId={editEntry} onClose={() => setEditEntry(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * one kind of entry: the group heading, its rows, and their bullets
 * ------------------------------------------------------------------ */

function GroupRows({
  kind,
  group,
  colCount,
  hues,
  open,
  setOpen,
  onEdit,
  onNew,
}: {
  kind: EntryKind;
  group: Entry[];
  colCount: number;
  hues: Record<string, string>;
  open: Record<string, boolean>;
  setOpen: (f: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  onEdit: (id: string) => void;
  onNew: (kind: EntryKind) => void;
}) {
  const s = useStore();
  const t = useT();
  const { db } = s;

  return (
    <>
      <tr>
        <td
          colSpan={colCount}
          className="sticky left-0 px-[13px] pb-1.5 pt-4"
          style={{ background: "var(--surface)" }}
        >
          <span className="flex items-center gap-2.5">
            <span className="text-[12.5px] font-semibold">{KIND_SECTION[kind]}</span>
            <span
              className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
              style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
            >
              {group.length}
            </span>
            <button className="btn btn-sm btn-mono" onClick={() => onNew(kind)}>
              + {t("newEntry")}
            </button>
          </span>
        </td>
      </tr>

      {group.map((e) => {
        const expanded = open[e.id];
        const h = entryHue(e);
        return (
          <Fragment key={e.id}>
            <tr className="group">
              <td
                className="sticky left-0 z-10 px-[13px] py-2"
                style={{ background: "var(--surface)", borderTop: "1px solid var(--grid)" }}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    className="mono mt-[2px] grid h-[22px] w-[30px] shrink-0 place-items-center rounded-[7px] text-[9.5px] transition"
                    style={{
                      background: h ? hue(h, "soft") : "var(--chip)",
                      color: h ? hue(h, "ink") : "var(--muted)",
                    }}
                    title={expanded ? t("collapse") : t("expand")}
                    onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
                  >
                    {expanded ? "▾" : "▸"} {h ?? KIND_ABBR[e.kind]}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold leading-[1.3]">{e.org}</div>
                    <div className="truncate text-[11.5px] leading-[1.35]" style={{ color: "var(--muted)" }}>
                      {e.title}
                      {e.period && ` · ${e.period}`}
                    </div>
                  </div>
                </div>
              </td>

              {db.variants.map((v) => {
                const u = entryUse(v, e);
                return (
                  <td key={v.id} className="px-1.5 py-2" style={{ borderTop: "1px solid var(--grid)" }}>
                    <EntryCell
                      h={hues[v.id]}
                      inVariant={u.inVariant}
                      used={u.used}
                      total={u.total}
                      kind={e.kind}
                      title={
                        !u.inVariant
                          ? t("clickAdd")
                          : u.used === 0 && u.total > 0 && needsBullets(e.kind)
                            ? t("noBullets")
                            : t("clickRemove")
                      }
                      onClick={() => s.setEntryInVariant(v.id, e.id, !u.inVariant)}
                    />
                  </td>
                );
              })}

              <td className="px-1.5 py-2" style={{ borderTop: "1px solid var(--grid)" }}>
                <div className="flex justify-end opacity-0 transition group-hover:opacity-100">
                  <IconBtn title={t("addEverywhere")} onClick={() => s.setEntryEverywhere(e.id, true)}>
                    ⊕
                  </IconBtn>
                  <IconBtn title={t("removeEverywhere")} onClick={() => s.setEntryEverywhere(e.id, false)}>
                    ⊖
                  </IconBtn>
                  <IconBtn title={t("edit")} onClick={() => onEdit(e.id)}>
                    ✎
                  </IconBtn>
                </div>
              </td>
            </tr>

            {expanded &&
              e.bullets.map((b) => (
                <tr key={b.id} className="group">
                  <td
                    className="sticky left-0 z-10 py-1 pl-[52px] pr-[13px]"
                    style={{ background: "var(--sunken)" }}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        className="min-w-0 flex-1 bg-transparent text-[11.5px] leading-[1.5] outline-none"
                        style={{ color: "var(--ink2)" }}
                        value={b.text}
                        onChange={(ev) => s.patchBullet(e.id, b.id, { text: ev.target.value })}
                      />
                      <TagChips
                        tags={b.tags}
                        all={ALL_TAGS}
                        size="xs"
                        onToggle={(tg) =>
                          s.patchBullet(e.id, b.id, {
                            tags: b.tags.includes(tg)
                              ? b.tags.filter((x) => x !== tg)
                              : [...b.tags, tg],
                          })
                        }
                      />
                    </div>
                  </td>
                  {db.variants.map((v) => {
                    const on = v.bulletIds.includes(b.id);
                    const ghost = !isInVariant(v, e.id);
                    return (
                      <td key={v.id} className="px-1.5 py-1" style={{ background: "var(--sunken)" }}>
                        <BulletCell
                          h={hues[v.id]}
                          on={on}
                          ghost={ghost}
                          title={ghost ? t("tickPullsEntry") : v.label}
                          onClick={() => s.setBulletInVariant(v.id, b.id, !on)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1" style={{ background: "var(--sunken)" }}>
                    <div className="flex justify-end opacity-0 transition group-hover:opacity-100">
                      <IconBtn danger title={t("remove")} onClick={() => s.removeBullet(e.id, b.id)}>
                        ✕
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}

            {expanded && (
              <tr>
                <td
                  colSpan={colCount}
                  className="sticky left-0 py-1.5 pl-[52px]"
                  style={{ background: "var(--sunken)" }}
                >
                  <button className="btn btn-sm" onClick={() => s.addBullet(e.id)}>
                    + {t("addBullet")}
                  </button>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

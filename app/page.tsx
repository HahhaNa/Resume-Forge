"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { baseName, buildTex, fileName, resolve } from "@/lib/resume";
import Preview from "@/components/resume/Preview";
import EntryModal from "@/components/resume/EntryModal";
import ImportResume from "@/components/ImportResume";
import {
  Check,
  Dot,
  Field,
  hue,
  hueOf,
  IconBtn,
  Modal,
  Ring,
  Select,
  TagChips,
  useCopied,
} from "@/components/ui/bits";
import { CONTACT_FIELDS } from "@/lib/types";
import type { Variant } from "@/lib/types";
import { ALL_TAGS, KIND_ABBR, defaultBulletIds, entryHue } from "@/lib/library";

/** A textarea that reads as plain text and grows with its content (see `.grow` in globals.css). */
function AutoText({
  value,
  onChange,
  muted,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`grow w-full text-[12px] leading-[1.45] ${className}`}
      data-value={value}
      style={{ color: muted ? "var(--muted)" : "var(--ink)" }}
    >
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none"
        style={{ color: "inherit" }}
      />
    </div>
  );
}

export default function ResumePage() {
  const s = useStore();
  const t = useT();
  const { db, activeVariantId } = s;
  const variant = db.variants.find((v) => v.id === activeVariantId) ?? db.variants[0];
  const [pages, setPages] = useState(0);
  const [q, setQ] = useState("");
  const [settings, setSettings] = useState(false);
  const [editEntry, setEditEntry] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [tagFor, setTagFor] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [copied, fireCopied] = useCopied();

  const tex = useMemo(() => (variant ? buildTex(db, variant) : ""), [db, variant]);
  const r = useMemo(() => (variant ? resolve(db, variant) : null), [db, variant]);

  if (!s.hydrated) return <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Loading…</div>;
  if (!variant) return <div className="p-8 text-sm">No variants. Go to Data → reset.</div>;

  const entryById = new Map(db.entries.map((e) => [e.id, e]));
  const on = new Set(variant.bulletIds);
  const over = pages > variant.pageTarget + 0.005;

  /** Bullets a variant actually renders — its whitelist can outlive deleted bullets. */
  const liveBullets = (v: Variant) => {
    const ids = new Set(v.bulletIds);
    return db.entries.reduce((n, e) => n + e.bullets.filter((b) => ids.has(b.id)).length, 0);
  };

  const download = () => {
    const blob = new Blob([tex], { type: "text/x-tex" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(db, variant, "tex");
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // "Save as PDF" takes its default filename from the tab title, so borrow it for the dialog.
  const printPdf = () => {
    const prev = document.title;
    document.title = baseName(db, variant);
    window.addEventListener("afterprint", () => (document.title = prev), { once: true });
    window.print();
  };

  const overleaf = () => {
    const f = document.createElement("form");
    f.method = "POST";
    f.action = "https://www.overleaf.com/docs";
    f.target = "_blank";
    const add = (name: string, value: string) => {
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = name;
      i.value = value;
      f.appendChild(i);
    };
    add("snip", tex);
    add("snip_name", fileName(db, variant, "tex"));
    add("engine", "pdflatex");
    document.body.appendChild(f);
    f.submit();
    f.remove();
  };

  const targets = variant.note
    .split(/[,·]/)
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <div className="print-root mx-auto grid max-w-[1700px] gap-3.5 p-3.5 lg:grid-cols-[1.28fr_minmax(430px,1fr)]">
      {/* ------------- left: editor ------------- */}
      <div className="noprint flex min-w-0 flex-col gap-3">
        {/* target variant */}
        <div className="card p-3.5">
          <div className="mb-[11px] flex items-center gap-2.5">
            <span className="lbl mb-0">{t("variant")}</span>
            <span className="rule" />
            <button className="btn btn-sm btn-mono" onClick={() => s.addVariant(variant.id)}>
              + {t("newVariant")}
            </button>
            <Link className="btn btn-sm btn-mono" href="/library">
              ⊞ {t("nav_library")}
            </Link>
            <button className="btn btn-sm btn-mono" onClick={() => setImportOpen(true)}>
              ↑ {t("importResume")}
            </button>
            <button className="btn btn-sm btn-mono" onClick={() => setSettings(true)}>
              ⚙ {t("edit")}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {db.variants.map((v, i) => {
              const active = v.id === variant.id;
              const h = hueOf(v.name, i);
              return (
                <button
                  key={v.id}
                  title={t("editVariantHint")}
                  onClick={() => s.setActiveVariant(v.id)}
                  onDoubleClick={() => {
                    s.setActiveVariant(v.id);
                    setSettings(true);
                  }}
                  className="flex flex-col gap-[5px] rounded-[11px] px-[11px] py-2.5 text-left transition"
                  style={{
                    background: active ? hue(h, "tint") : "var(--raise)",
                    border: `1px solid ${active ? hue(h, "line") : "var(--grid)"}`,
                    userSelect: "none",
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <Dot color={hue(h)} />
                    <span
                      className="truncate text-[12.5px] font-semibold leading-[1.2]"
                      style={{ color: active ? "var(--ink)" : "var(--ink2)" }}
                    >
                      {v.label}
                    </span>
                  </span>
                  <span
                    className="mono text-[10.5px] leading-none"
                    style={{ color: active ? hue(h, "ink") : "var(--faint)" }}
                  >
                    /{v.name} · {liveBullets(v)} {t("bullets")}
                  </span>
                </button>
              );
            })}
          </div>

          {targets.length > 0 && (
            <div className="mt-[11px] flex flex-wrap items-center gap-[5px]">
              <span className="mono mr-0.5 text-[10px]" style={{ color: "var(--faint)" }}>
                aims at
              </span>
              {targets.map((x, i) => (
                <span key={i} className="chip">
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* search */}
        <div className="card flex items-center gap-2.5 px-[13px] py-2.5">
          <span className="text-[13px]" style={{ color: "var(--faint)" }}>
            ⌕
          </span>
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            placeholder={`${t("search")} bullets, entries, tags…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="mono text-[11px]" style={{ color: "var(--muted)" }} onClick={() => setQ("")}>
              clear ✕
            </button>
          )}
        </div>

        {/* sections */}
        {variant.sections.map((sec, si) => {
          const secEntries = sec.type === "entries" ? sec.ids.map((id) => entryById.get(id)) : [];
          const secTotal = secEntries.reduce((n, e) => n + (e?.bullets.length ?? 0), 0);
          const secOn = secEntries.reduce(
            (n, e) => n + (e?.bullets.filter((b) => on.has(b.id)).length ?? 0),
            0
          );
          return (
            <div key={sec.id} className="flex flex-col gap-2.5">
              {/* section head — the title stays editable, the chrome only shows on hover */}
              <div className="group flex items-center gap-2.5 px-[3px]">
                <input
                  className="min-w-0 flex-none bg-transparent text-[14.5px] font-semibold outline-none"
                  size={Math.max(6, sec.title.length)}
                  value={sec.title}
                  onChange={(e) => s.patchSection(variant.id, sec.id, { title: e.target.value })}
                />
                {sec.type === "entries" && (
                  <span
                    className="mono rounded-full px-[7px] text-[10px] leading-[1.5]"
                    style={{ background: "var(--chip-hover)", color: "var(--ink2)" }}
                  >
                    {sec.ids.length}
                  </span>
                )}
                <span className="rule" style={{ background: "var(--axis)" }} />
                <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
                  {sec.type === "entries"
                    ? `${secOn} of ${secTotal} ${t("bullets")} used`
                    : `${sec.ids.length} groups`}
                </span>
                <span className="flex opacity-0 transition group-hover:opacity-100">
                  <IconBtn title="up" disabled={si === 0} onClick={() => s.moveSection(variant.id, sec.id, -1)}>
                    ↑
                  </IconBtn>
                  <IconBtn
                    title="down"
                    disabled={si === variant.sections.length - 1}
                    onClick={() => s.moveSection(variant.id, sec.id, 1)}
                  >
                    ↓
                  </IconBtn>
                  <IconBtn title="delete" danger onClick={() => s.removeSection(variant.id, sec.id)}>
                    ✕
                  </IconBtn>
                </span>
              </div>

              {sec.type === "skills" ? (
                <div className="card card-raised flex flex-col gap-2 p-[13px]">
                  {db.skills.map((sk) => {
                    const used = sec.ids.includes(sk.id);
                    return (
                      <div
                        key={sk.id}
                        className="group flex items-start gap-2.5 rounded-[11px] px-2.5 py-2.5"
                        style={{
                          background: used ? "var(--accent-soft)" : "var(--sunken)",
                        }}
                      >
                        <Check on={used} onClick={() => s.toggleEntryInVariant(variant.id, sec.id, sk.id)} />
                        <div className="min-w-0 flex-1">
                          <input
                            className="w-full bg-transparent text-[12.5px] font-semibold outline-none"
                            style={{ color: used ? "var(--ink)" : "var(--ink2)" }}
                            value={sk.label}
                            onChange={(e) => s.patchSkill(sk.id, { label: e.target.value })}
                          />
                          <AutoText
                            value={sk.items}
                            muted={!used}
                            onChange={(v) => s.patchSkill(sk.id, { items: v })}
                          />
                        </div>
                        <div className="flex opacity-0 transition group-hover:opacity-100">
                          <IconBtn disabled={!used} onClick={() => s.moveEntryInVariant(variant.id, sec.id, sk.id, -1)}>
                            ↑
                          </IconBtn>
                          <IconBtn disabled={!used} onClick={() => s.moveEntryInVariant(variant.id, sec.id, sk.id, 1)}>
                            ↓
                          </IconBtn>
                          <IconBtn danger onClick={() => s.removeSkill(sk.id)}>
                            ✕
                          </IconBtn>
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn btn-sm self-start" onClick={() => s.addSkill()}>
                    + {t("skills")}
                  </button>
                </div>
              ) : (
                <>
                  {sec.ids.map((eid, ei) => {
                    const e = entryById.get(eid);
                    if (!e) return null;
                    const bullets = e.bullets.filter(
                      (b) =>
                        !q ||
                        b.text.toLowerCase().includes(q.toLowerCase()) ||
                        e.org.toLowerCase().includes(q.toLowerCase())
                    );
                    const onCount = e.bullets.filter((b) => on.has(b.id)).length;
                    const h = entryHue(e);
                    return (
                      <div key={eid} className="card card-raised flex flex-col gap-2.5 p-[13px]">
                        {/* header */}
                        <div className="group flex items-start gap-[11px]">
                          {/* the badge is the entry's tag control — click it to set or clear */}
                          <div className="relative shrink-0">
                            <button
                              onClick={() => setTagFor(tagFor === e.id ? null : e.id)}
                              className="mono grid h-8 w-8 place-items-center rounded-[10px] text-[10.5px] font-medium transition"
                              style={{
                                background: h ? hue(h, "soft") : "var(--chip)",
                                color: h ? hue(h, "ink") : "var(--muted)",
                                outline: tagFor === e.id ? "2px solid var(--accent)" : "none",
                                outlineOffset: 1,
                              }}
                              title={
                                e.tags.length
                                  ? `tagged /${e.tags.join(" /")} — click to change`
                                  : h
                                    ? `no entry tag — /${h} inferred from its bullets. Click to set one.`
                                    : "click to tag this entry"
                              }
                            >
                              {h ?? KIND_ABBR[e.kind]}
                            </button>
                            {tagFor === e.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setTagFor(null)} />
                                <div
                                  className="card absolute left-0 top-[38px] z-20 flex w-max flex-col gap-1.5 p-2.5"
                                  style={{ boxShadow: "var(--lift-3)" }}
                                >
                                  <TagChips
                                    tags={e.tags}
                                    all={ALL_TAGS}
                                    onToggle={(tg) =>
                                      s.patchEntry(e.id, {
                                        tags: e.tags.includes(tg)
                                          ? e.tags.filter((x) => x !== tg)
                                          : [...e.tags, tg],
                                      })
                                    }
                                  />
                                  <span className="mono whitespace-nowrap text-[9.5px]" style={{ color: "var(--faint)" }}>
                                    {e.tags.length ? "entry tag" : "none set — inferred from bullets"}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <div className="truncate text-[15px] font-semibold leading-[1.25]">{e.org}</div>
                            <div className="truncate text-[12px] leading-[1.35]" style={{ color: "var(--ink2)" }}>
                              {e.title}
                              {e.location && ` · ${e.location}`}
                            </div>
                          </div>
                          <span className="mono shrink-0 text-[10.5px] leading-[1.6]" style={{ color: "var(--faint)" }}>
                            {e.period}
                          </span>
                          <Ring value={onCount} max={e.bullets.length} />
                          <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                            <IconBtn title={t("edit")} onClick={() => setEditEntry(e.id)}>
                              ✎
                            </IconBtn>
                            <IconBtn disabled={ei === 0} onClick={() => s.moveEntryInVariant(variant.id, sec.id, eid, -1)}>
                              ↑
                            </IconBtn>
                            <IconBtn
                              disabled={ei === sec.ids.length - 1}
                              onClick={() => s.moveEntryInVariant(variant.id, sec.id, eid, 1)}
                            >
                              ↓
                            </IconBtn>
                            <IconBtn danger title={t("remove")} onClick={() => s.toggleEntryInVariant(variant.id, sec.id, eid)}>
                              ✕
                            </IconBtn>
                          </div>
                        </div>

                        {/* bullets */}
                        {bullets.map((b, bi) => {
                          const isOn = on.has(b.id);
                          return (
                            <div
                              key={b.id}
                              className="group flex items-start gap-2.5 rounded-[11px] px-2.5 py-2.5 transition"
                              style={{ background: isOn ? "var(--accent-soft)" : "var(--sunken)" }}
                            >
                              <Check on={isOn} onClick={() => s.toggleBulletInVariant(variant.id, b.id)} />
                              <div className="min-w-0 flex-1">
                                <AutoText
                                  value={b.text}
                                  muted={!isOn}
                                  onChange={(v) => s.patchBullet(e.id, b.id, { text: v })}
                                />
                              </div>
                              {/* tags on the bullet stay visible; the rest of the palette
                                  and the row actions only appear on hover */}
                              {b.tags.length > 0 ? (
                                <TagChips
                                  tags={b.tags}
                                  all={b.tags}
                                  size="xs"
                                  onToggle={(tg) =>
                                    s.patchBullet(e.id, b.id, { tags: b.tags.filter((x) => x !== tg) })
                                  }
                                />
                              ) : (
                                <span
                                  className="mono shrink-0 rounded-md px-1.5 text-[9.5px] leading-[16px] group-hover:hidden"
                                  style={{ background: "var(--chip)", color: "var(--faint)" }}
                                >
                                  untagged
                                </span>
                              )}
                              <div className="flex shrink-0 items-start opacity-0 transition group-hover:opacity-100">
                                <TagChips
                                  tags={[]}
                                  all={ALL_TAGS.filter((x) => !b.tags.includes(x))}
                                  size="xs"
                                  onToggle={(tg) => s.patchBullet(e.id, b.id, { tags: [...b.tags, tg] })}
                                />
                                <IconBtn disabled={bi === 0} onClick={() => s.moveBullet(e.id, b.id, -1)}>
                                  ↑
                                </IconBtn>
                                <IconBtn disabled={bi === bullets.length - 1} onClick={() => s.moveBullet(e.id, b.id, 1)}>
                                  ↓
                                </IconBtn>
                                <IconBtn danger onClick={() => s.removeBullet(e.id, b.id)}>
                                  ✕
                                </IconBtn>
                              </div>
                            </div>
                          );
                        })}

                        {/* entry footer */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button className="btn btn-sm" onClick={() => s.addBullet(e.id)}>
                            + {t("addBullet")}
                          </button>
                          <span className="rule mx-1" />
                          <button
                            className="btn btn-sm btn-mono"
                            onClick={() => s.setBulletsInVariant(variant.id, e.bullets.map((b) => b.id), true)}
                          >
                            {t("selectAll")}
                          </button>
                          <button
                            className="btn btn-sm btn-mono"
                            onClick={() => s.setBulletsInVariant(variant.id, e.bullets.map((b) => b.id), false)}
                          >
                            {t("selectNone")}
                          </button>
                          <button
                            className="btn btn-sm btn-mono"
                            onClick={() => {
                              s.setBulletsInVariant(variant.id, e.bullets.map((b) => b.id), false);
                              s.setBulletsInVariant(
                                variant.id,
                                e.bullets.filter((b) => b.tags.includes(variant.name)).map((b) => b.id),
                                true
                              );
                            }}
                          >
                            {t("selectTagged")} /{variant.name}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn btn-sm self-start" onClick={() => setAddTo(sec.id)}>
                    + {t("addEntry")}
                  </button>
                </>
              )}
            </div>
          );
        })}

        <div className="flex gap-2">
          <button className="btn" onClick={() => s.addSectionToVariant(variant.id, "New section", "entries")}>
            + {t("addSection")} ({t("entries")})
          </button>
          <button className="btn" onClick={() => s.addSectionToVariant(variant.id, "Technical Skills", "skills")}>
            + {t("addSection")} ({t("skills")})
          </button>
        </div>
      </div>

      {/* ------------- right: export + preview ------------- */}
      {/* A sticky column taller than the viewport puts its own foot out of reach — nothing left
          to scroll once it is pinned. Cap it at the viewport and let the sheet scroll inside,
          so the export buttons and the fill gauge stay put while the résumé moves under them. */}
      <div className="print-col flex min-w-0 flex-col gap-3 lg:sticky lg:top-[66px] lg:max-h-[calc(100vh-80px)] lg:self-start">
        <div className="noprint card flex shrink-0 flex-col gap-3 p-[13px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn btn-primary" onClick={overleaf}>
              {t("openOverleaf")} ↗
            </button>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(tex);
                fireCopied();
              }}
            >
              {copied ? `✓ ${t("copied")}` : t("copyTex")}
            </button>
            <button className="btn" onClick={download}>
              ↓ .tex
            </button>
            <button className="btn" onClick={printPdf}>
              {t("printPdf")}
            </button>
          </div>

          {/* page fit — a real gauge: the notch is the target, the bar can run past it */}
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-baseline gap-2">
              <span className="lbl mb-0">{t("fill")}</span>
              <span className="flex-1" />
              <span className="text-[12px] font-medium" style={{ color: over ? "var(--crit)" : "var(--good)" }}>
                {over ? t("overflow") : t("fits")}
              </span>
              <span className="mono tabnum text-[11px]" style={{ color: "var(--muted)" }}>
                {pages.toFixed(2)} / {variant.pageTarget.toFixed(2)}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (pages / (variant.pageTarget * 1.28)) * 100)}%`,
                  background: over
                    ? "var(--crit)"
                    : "linear-gradient(90deg, oklch(0.62 0.14 200), var(--accent))",
                }}
              />
              <span
                className="absolute inset-y-0 w-px"
                style={{ left: `${100 / 1.28}%`, background: "var(--surface)", opacity: 0.9 }}
                title={`target ${variant.pageTarget}`}
              />
            </div>
            <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
              {r?.bulletCount} {t("bullets")} · {Math.max(1, Math.ceil(pages))} page
              {Math.ceil(pages) > 1 ? "s" : ""} · {variant.sections.length} {t("sections").toLowerCase()}
            </span>
          </div>
        </div>
        <div className="preview-scroll lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <Preview db={db} variant={variant} onPages={setPages} />
        </div>
      </div>

      {/* ------------- modals ------------- */}
      <Modal open={settings} onClose={() => setSettings(false)} title={t("variant")}>
        <div className="space-y-3">
          <Field label={t("label")} value={variant.label} onChange={(v) => s.patchVariant(variant.id, { label: v })} />
          <Field
            label={t("slug")}
            value={variant.name}
            onChange={(v) => s.patchVariant(variant.id, { name: v.replace(/[^a-z0-9-]/gi, "").toLowerCase() })}
          />
          <Field label={t("note")} value={variant.note} onChange={(v) => s.patchVariant(variant.id, { note: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Select
              label={t("density")}
              value={variant.density}
              onChange={(v) => s.patchVariant(variant.id, { density: v as Variant["density"] })}
              options={[
                { value: "tight", label: t("tight") },
                { value: "normal", label: t("normal") },
                { value: "airy", label: t("airy") },
              ]}
            />
            <Select
              label={t("fontSize")}
              value={String(variant.fontSize)}
              onChange={(v) => s.patchVariant(variant.id, { fontSize: Number(v) as Variant["fontSize"] })}
              options={[
                { value: "10", label: "10 pt" },
                { value: "10.5", label: "10.5 pt" },
                { value: "11", label: "11 pt" },
              ]}
            />
            <Select
              label={t("pageTarget")}
              value={String(variant.pageTarget)}
              onChange={(v) => s.patchVariant(variant.id, { pageTarget: Number(v) as 1 | 2 })}
              options={[
                { value: "1", label: "1" },
                { value: "2", label: "2" },
              ]}
            />
            <Select
              label="Header links"
              value={variant.linkStyle ?? "full"}
              onChange={(v) => s.patchVariant(variant.id, { linkStyle: v as Variant["linkStyle"] })}
              options={[
                { value: "full", label: "Full URL" },
                { value: "short", label: "Short label" },
              ]}
            />
          </div>

          <div>
            <span className="lbl">Contact</span>
            <p className="mb-2 text-[11px]" style={{ color: "var(--muted)" }}>
              Untick to leave a field off this variant. Leave a box empty to use the profile value
              from the Data page — fill it in to override just here.
            </p>
            <div className="flex flex-col gap-1.5">
              {CONTACT_FIELDS.map((f) => {
                const overridden = Boolean(variant.contact?.[f]?.trim());
                // email has no toggle: a résumé without one is not worth generating
                const shown = f === "email" || variant.header[f];
                return (
                  <div key={f} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="ck"
                      checked={shown}
                      disabled={f === "email"}
                      title={f === "email" ? "always shown" : `show ${f}`}
                      onChange={() =>
                        s.patchVariant(variant.id, {
                          header: { ...variant.header, [f]: !variant.header[f as keyof Variant["header"]] },
                        })
                      }
                    />
                    <span
                      className="mono w-[56px] shrink-0 text-[10.5px]"
                      style={{ color: shown ? "var(--ink2)" : "var(--faint)" }}
                    >
                      {f}
                    </span>
                    <input
                      className="inp"
                      style={{
                        opacity: shown ? 1 : 0.45,
                        borderColor: overridden ? "var(--accent)" : undefined,
                      }}
                      placeholder={s.db.profile[f] || "—"}
                      value={variant.contact?.[f] ?? ""}
                      onChange={(e) =>
                        s.patchVariant(variant.id, {
                          contact: { ...variant.contact, [f]: e.target.value },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {db.variants.length > 1 && (
            <button
              className="btn"
              style={{ color: "var(--crit)" }}
              onClick={() => {
                s.removeVariant(variant.id);
                setSettings(false);
              }}
            >
              {t("deleteVariant")}
            </button>
          )}
        </div>
      </Modal>

      <AddEntryModal
        open={addTo !== null}
        onClose={() => setAddTo(null)}
        sectionId={addTo}
        variantId={variant.id}
      />

      <EntryModal entryId={editEntry} onClose={() => setEditEntry(null)} />

      <ImportResume open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function AddEntryModal({
  open,
  onClose,
  sectionId,
  variantId,
}: {
  open: boolean;
  onClose: () => void;
  sectionId: string | null;
  variantId: string;
}) {
  const s = useStore();
  const t = useT();
  const variant = s.db.variants.find((v) => v.id === variantId);
  const sec = variant?.sections.find((x) => x.id === sectionId);
  const available = s.db.entries.filter((e) => !sec?.ids.includes(e.id));
  return (
    <Modal open={open} onClose={onClose} title={t("addEntry")}>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
        {available.map((e) => (
          <button
            key={e.id}
            className="btn w-full justify-start"
            onClick={() => {
              if (sectionId) s.toggleEntryInVariant(variantId, sectionId, e.id);
              // an entry with nothing ticked renders as nothing — start it switched on
              if (variant && !e.bullets.some((b) => variant.bulletIds.includes(b.id)))
                s.setBulletsInVariant(variantId, defaultBulletIds(variant, e), true);
              onClose();
            }}
          >
            <span className="chip mr-1">{KIND_ABBR[e.kind]}</span>
            <span className="truncate">{e.org}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-primary mt-3"
        onClick={() => {
          const id = s.addEntry({ org: "New entry", kind: "project" });
          if (sectionId) s.toggleEntryInVariant(variantId, sectionId, id);
          onClose();
        }}
      >
        + New blank entry
      </button>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Modal, Select, hue, hueOf } from "@/components/ui/bits";
import { diffVariants } from "@/lib/library";
import { richHtmlParts } from "@/lib/resume";
import type { Variant } from "@/lib/types";

/** One side's worth of a difference, tinted with that variant's own hue. */
function Side({
  slug,
  colour,
  lines,
}: {
  slug: string;
  colour: string;
  lines: { id: string; text: string; faint?: boolean }[];
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mono mb-1 text-[10px] leading-none" style={{ color: colour }}>
        /{slug}
      </div>
      {lines.length === 0 ? (
        <div className="text-[11.5px]" style={{ color: "var(--faint)" }}>
          —
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((l) => (
            <li
              key={l.id}
              className="rounded-[7px] px-2 py-1 text-[11.5px] leading-[1.45]"
              style={{
                background: "var(--sunken)",
                color: l.faint ? "var(--muted)" : "var(--ink2)",
              }}
            >
              {richHtmlParts(l.text).map((p) =>
                p.bold ? <strong key={p.key}>{p.text}</strong> : <span key={p.key}>{p.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="lbl mb-0">{title}</span>
        <span className="rule" />
      </div>
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

/**
 * Two variants, side by side, showing only where they disagree.
 *
 * The question this answers is the one you ask while tailoring the second résumé — "what
 * does /ml say that /hw doesn't" — and the answer is useless if it also lists the thirty
 * lines they share. So the shared spine is a single number at the top and everything below
 * it is a difference.
 */
export default function CompareVariants({
  open,
  onClose,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  variant: Variant;
}) {
  const t = useT();
  const db = useStore((s) => s.db);
  const others = db.variants.filter((v) => v.id !== variant.id);
  const [againstId, setAgainstId] = useState("");
  const against = others.find((v) => v.id === againstId) ?? others[0];

  if (!open || !against) return null;

  const d = diffVariants(db, variant, against);
  const hueA = hue(hueOf(variant.name, db.variants.indexOf(variant), db.tags), "ink");
  const hueB = hue(hueOf(against.name, db.variants.indexOf(against), db.tags), "ink");
  const nothing =
    !d.entries.onlyA.length &&
    !d.entries.onlyB.length &&
    !d.bullets.length &&
    !d.skills.onlyA.length &&
    !d.skills.onlyB.length;

  const label = (e: { org: string; title: string }) => (e.title ? `${e.org} — ${e.title}` : e.org);

  return (
    <Modal open onClose={onClose} title={`/${variant.name} ⇄ /${against.name}`} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t("compareWith")}
            className="min-w-[200px]"
            value={against.id}
            onChange={setAgainstId}
            options={others.map((v) => ({ value: v.id, label: `/${v.name} — ${v.label}` }))}
          />
          <span className="mono pb-1.5 text-[11px]" style={{ color: "var(--faint)" }}>
            {d.shared} {t("sharedBullets")}
          </span>
        </div>

        {nothing && !d.settings.length && (
          <p className="text-[12px]" style={{ color: "var(--muted)" }}>
            {t("sameContent")}
          </p>
        )}

        {(!!d.entries.onlyA.length || !!d.entries.onlyB.length) && (
          <Row title={`${t("onlyIn")} — ${t("entries")}`}>
            <Side
              slug={variant.name}
              colour={hueA}
              lines={d.entries.onlyA.map((e) => ({ id: e.id, text: label(e) }))}
            />
            <Side
              slug={against.name}
              colour={hueB}
              lines={d.entries.onlyB.map((e) => ({ id: e.id, text: label(e) }))}
            />
          </Row>
        )}

        {d.bullets.map((b) => (
          <Row key={b.entry.id} title={label(b.entry)}>
            <Side
              slug={variant.name}
              colour={hueA}
              lines={b.onlyA.map((x) => ({ id: x.id, text: x.text }))}
            />
            <Side
              slug={against.name}
              colour={hueB}
              lines={b.onlyB.map((x) => ({ id: x.id, text: x.text }))}
            />
          </Row>
        ))}

        {(!!d.skills.onlyA.length || !!d.skills.onlyB.length) && (
          <Row title={`${t("onlyIn")} — ${t("skills")}`}>
            <Side
              slug={variant.name}
              colour={hueA}
              lines={d.skills.onlyA.map((k) => ({ id: k.id, text: `${k.label}: ${k.items}` }))}
            />
            <Side
              slug={against.name}
              colour={hueB}
              lines={d.skills.onlyB.map((k) => ({ id: k.id, text: `${k.label}: ${k.items}` }))}
            />
          </Row>
        )}

        {!!d.settings.length && (
          <Row title={t("layoutDiffers")}>
            <Side
              slug={variant.name}
              colour={hueA}
              lines={d.settings.map((x) => ({ id: x.key, text: `${x.key}: ${x.a}`, faint: true }))}
            />
            <Side
              slug={against.name}
              colour={hueB}
              lines={d.settings.map((x) => ({ id: x.key, text: `${x.key}: ${x.b}`, faint: true }))}
            />
          </Row>
        )}
      </div>
    </Modal>
  );
}

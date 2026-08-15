"use client";

import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Dot, hue, hueOf } from "@/components/ui/bits";
import { isInVariant } from "@/lib/library";

/**
 * One row of variant chips: which résumés carry this entry or skill group.
 * The point of it is `all` — a new experience goes into every variant in one click,
 * instead of being re-added variant by variant.
 */
export default function VariantPicker({
  id,
  onSet,
  onSetAll,
}: {
  id: string;
  onSet: (variantId: string, on: boolean) => void;
  onSetAll: (on: boolean) => void;
}) {
  const db = useStore((s) => s.db);
  const t = useT();
  const inCount = db.variants.filter((v) => isInVariant(v, id)).length;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="lbl mb-0">{t("usedIn")}</span>
        <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
          {inCount} / {db.variants.length}
        </span>
        <span className="rule" />
        <button className="btn btn-sm btn-mono" onClick={() => onSetAll(true)}>
          {t("selectAll")}
        </button>
        <button className="btn btn-sm btn-mono" onClick={() => onSetAll(false)}>
          {t("selectNone")}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {db.variants.map((v, i) => {
          const on = isInVariant(v, id);
          const h = hueOf(v.name, i, db.tags);
          return (
            <button
              key={v.id}
              onClick={() => onSet(v.id, !on)}
              className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-[6px] text-[12px] transition"
              style={{
                background: on ? hue(h, "tint") : "var(--raise)",
                border: `1px solid ${on ? hue(h, "line") : "var(--grid)"}`,
                color: on ? "var(--ink)" : "var(--muted)",
                fontWeight: on ? 500 : 400,
              }}
            >
              <Dot color={on ? hue(h) : "var(--track)"} />
              {v.label}
              <span className="mono text-[10px]" style={{ color: on ? hue(h, "ink") : "var(--faint)" }}>
                /{v.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

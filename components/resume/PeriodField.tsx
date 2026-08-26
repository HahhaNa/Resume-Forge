"use client";

import { useT } from "@/lib/i18n";
import { display } from "@/lib/resume";
import {
  EMPTY_PERIOD,
  TERMS,
  formatPeriod,
  parsePeriod,
  yearOptions,
  type Period,
} from "@/lib/period";

/** Marks the "no month, just the year" option, and the end of an open range. */
const NONE = "—";
const PRESENT_VALUE = " present";

/** A select sized to its own content, so four of them still read as one date row. */
function Pick({
  value,
  onChange,
  options,
  title,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  title?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="inp mono w-auto px-1.5 py-1 text-[12px] disabled:opacity-40"
      value={value}
      title={title}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * The period, edited as parts.
 *
 * It used to be a text box, and a text box is why one entry says "Sept 2025"
 * while the one under it says "September 2025". Every shape the dropdowns can
 * make goes through `formatPeriod`, so the dates down a page are formatted the
 * same by construction rather than by remembering.
 *
 * A stored period the parts cannot express — an import that wrote something
 * freer — stays editable as text rather than being rounded into the nearest
 * pair of dropdowns and losing what it said.
 */
export default function PeriodField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const p = parsePeriod(value);

  if (!p) {
    return (
      <div>
        <span className="lbl">{t("period")}</span>
        <div className="flex items-center gap-1.5">
          <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} />
          <button className="btn btn-sm shrink-0" onClick={() => onChange("")}>
            {t("usePicker")}
          </button>
        </div>
        <div className="mono mt-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
          {t("periodCustom")}
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Period>) => onChange(formatPeriod({ ...p, ...patch }));
  const thisYear = String(new Date().getFullYear());
  const years = yearOptions(p.startYear, p.endYear);
  const termOptions = [
    { value: "", label: NONE },
    ...TERMS.map((term) => ({ value: term, label: term })),
  ];
  const yearOpts = (extra: { value: string; label: string }[] = []) => [
    { value: "", label: NONE },
    ...extra,
    ...years.map((y) => ({ value: y, label: y })),
  ];

  /* Picking a month with no year yet would format to nothing at all, which
     reads as a dropdown that does not work. The current year is the answer
     that is right most often, and changing it is one more click. */
  const startTerm = (term: string) =>
    set({ startTerm: term, startYear: p.startYear || (term ? thisYear : "") });
  const endTerm = (term: string) =>
    set({ endTerm: term, endYear: p.endYear || (term ? thisYear : "") });
  const endYear = (v: string) =>
    v === PRESENT_VALUE
      ? set({ present: true, endTerm: "", endYear: "" })
      : set({ present: false, endYear: v, endTerm: v ? p.endTerm : "" });

  return (
    <div>
      <span className="lbl">{t("period")}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pick
          value={p.startTerm}
          onChange={startTerm}
          options={termOptions}
          title={t("periodMonth")}
        />
        <Pick
          value={p.startYear}
          onChange={(v) => set({ startYear: v, startTerm: v ? p.startTerm : "" })}
          options={yearOpts()}
          title={t("periodYear")}
        />
        <span className="mono text-[12px]" style={{ color: "var(--faint)" }}>
          –
        </span>
        <Pick
          value={p.endTerm}
          onChange={endTerm}
          options={termOptions}
          title={t("periodMonth")}
          disabled={p.present}
        />
        <Pick
          value={p.present ? PRESENT_VALUE : p.endYear}
          onChange={endYear}
          options={yearOpts([{ value: PRESENT_VALUE, label: t("present") }])}
          title={t("periodYear")}
        />
        <label
          className="ml-1 flex cursor-pointer items-center gap-1 text-[11.5px]"
          style={{ color: p.expected ? "var(--ink2)" : "var(--muted)" }}
          title={t("expectedHint")}
        >
          <input
            type="checkbox"
            className="ck"
            checked={p.expected}
            onChange={(e) => set({ expected: e.target.checked })}
          />
          {t("expected")}
        </label>
        {value && (
          <button
            className="btn btn-sm btn-mono ml-auto"
            onClick={() => onChange(formatPeriod(EMPTY_PERIOD))}
          >
            {t("clear")}
          </button>
        )}
      </div>
      {/* what the page will actually say, dash and all */}
      <div className="mono mt-1.5 text-[10.5px]" style={{ color: "var(--faint)" }}>
        {value ? display(value) : t("periodEmpty")}
      </div>
    </div>
  );
}

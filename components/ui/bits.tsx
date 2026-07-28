"use client";

import { useEffect, useId, useRef, useState } from "react";

export function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  textarea,
  rows = 3,
  type,
  /** values already used elsewhere in the db — offered as native autocomplete */
  suggest,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  textarea?: boolean;
  rows?: number;
  type?: "text" | "date" | "url";
  suggest?: string[];
}) {
  const listId = useId();
  return (
    <label className={`block ${className}`}>
      {label && <span className="lbl">{label}</span>}
      {textarea ? (
        <textarea
          className="inp resize-y"
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <>
          <input
            className="inp"
            type={type ?? "text"}
            value={value}
            placeholder={placeholder}
            list={suggest?.length ? listId : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {!!suggest?.length && (
            <datalist id={listId}>
              {suggest.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      )}
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  className = "",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="lbl">{label}</span>}
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function IconBtn({
  children,
  onClick,
  title,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`ibtn${danger ? " ibtn-danger" : ""}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * variant hues — four same-chroma families. A tag, a variant tab and a
 * chart series that share a slug share a hue, so colour carries meaning.
 * ------------------------------------------------------------------ */

export const HUES = ["hw", "ml", "sw", "tw"] as const;
export type Hue = (typeof HUES)[number];

/** Named slug wins; anything else cycles the four families by position. */
export function hueOf(key: string, index = 0): Hue {
  return (HUES as readonly string[]).includes(key) ? (key as Hue) : HUES[index % HUES.length];
}

export const hue = (h: Hue | string, part?: "ink" | "soft" | "tint" | "line") =>
  `var(--${h}${part ? `-${part}` : ""})`;

/** The 7px square that prefixes a variant, platform or series label. */
export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-[2px]"
      style={{ width: size, height: size, background: color, display: "inline-block" }}
    />
  );
}

export function TagChips({
  tags,
  all,
  onToggle,
  size = "sm",
}: {
  tags: string[];
  all: string[];
  onToggle?: (t: string) => void;
  size?: "sm" | "xs";
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {all.map((t, i) => {
        const on = tags.includes(t);
        const h = hueOf(t, i);
        return (
          <button
            key={t}
            onClick={() => onToggle?.(t)}
            disabled={!onToggle}
            className={`mono rounded-md px-1.5 ${size === "xs" ? "text-[9.5px]" : "text-[10.5px]"} leading-[16px] transition`}
            style={{
              color: on ? hue(h, "ink") : "var(--faint)",
              background: on ? hue(h, "soft") : "transparent",
              fontWeight: on ? 500 : 400,
              border: `1px solid ${on ? "transparent" : "var(--grid)"}`,
              cursor: onToggle ? "pointer" : "default",
            }}
          >
            {t}
          </button>
        );
      })}
    </span>
  );
}

/** A stat tile: mono label, the number, and a line of real trend text under it. */
export function Stat({
  k,
  v,
  sub,
  subTone,
  accent,
}: {
  k: string;
  v: React.ReactNode;
  sub?: React.ReactNode;
  subTone?: string;
  accent?: string;
}) {
  return (
    <div
      className="card px-[13px] py-3"
      /* every tile carries the 2px top edge so the flagged one does not sit 1px taller */
      style={{ borderTop: `2px solid ${accent ?? "transparent"}` }}
    >
      <div
        className="mono text-[9px] font-medium uppercase tracking-[.14em]"
        style={{ color: accent ? "var(--accent-ink)" : "var(--faint)" }}
      >
        {k}
      </div>
      <div className="tabnum mt-[7px] text-[27px] font-semibold leading-[1.1] tracking-tight">{v}</div>
      <div className="mono mt-[5px] text-[10px] leading-none" style={{ color: subTone ?? "var(--muted)" }}>
        {sub ?? " "}
      </div>
    </div>
  );
}

export function Bar({
  value,
  max,
  color,
  label,
  tip,
  height = 9,
}: {
  value: number;
  max: number;
  color: string;
  label?: string;
  tip?: string;
  height?: number;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: "var(--track)" }}
      title={tip}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color }}
        aria-label={label}
      />
    </div>
  );
}

/** Coverage ring — how much of an entry is switched on in this variant. */
export function Ring({
  value,
  max,
  size = 30,
  color = "var(--accent)",
}: {
  value: number;
  max: number;
  size?: number;
  color?: string;
}) {
  const turn = max > 0 ? value / max : 0;
  const inner = size - 7;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} 0turn ${turn}turn, var(--track) ${turn}turn 1turn)`,
      }}
      title={`${value} / ${max}`}
    >
      <div
        className="mono tabnum grid place-items-center rounded-full text-[8.5px]"
        style={{
          width: inner,
          height: inner,
          background: "var(--surface)",
          color: value > 0 ? "var(--ink2)" : "var(--muted)",
        }}
      >
        {value}/{max}
      </div>
    </div>
  );
}

/** The square checkbox from the entry cards: filled + ticked when on. */
export function Check({ on, onClick, size = 15 }: { on: boolean; onClick?: () => void; size?: number }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="mt-[1px] grid shrink-0 place-items-center rounded-[5px] text-[9px] font-semibold leading-none transition"
      style={{
        width: size,
        height: size,
        background: on ? "var(--accent)" : "var(--surface)",
        border: on ? "1.5px solid var(--accent)" : "1.5px solid var(--ring)",
        color: "#fff",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {on ? "✓" : ""}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="noprint fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
      style={{ background: "rgba(24,22,20,.5)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="card my-6 w-full p-5"
        style={{ maxWidth: wide ? 900 : 560, boxShadow: "var(--lift-3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <button className="btn btn-sm ml-auto" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = () => {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return [copied, fire] as const;
}

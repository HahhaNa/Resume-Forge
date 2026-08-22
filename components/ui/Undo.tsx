"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

/** Long enough to read the label and reach the button, short enough not to sit there. */
const LINGER_MS = 9000;

/**
 * Inside a field, Cmd-Z belongs to the browser — it walks back through the typing
 * character by character, which is what anyone pressing it in a text box means. Ours
 * takes over everywhere else, where the last thing that happened was a click.
 */
const isEditing = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

/**
 * `⌘Z` / `⇧⌘Z` or their Ctrl equivalents. Decided after mount, because the server has
 * no idea which keyboard is out there and a guess would not survive hydration.
 */
function useShortcut() {
  const [mac, setMac] = useState<boolean | null>(null);
  useEffect(() => setMac(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)), []);
  if (mac === null) return { undo: "", redo: "" };
  return mac ? { undo: "⌘Z", redo: "⇧⌘Z" } : { undo: "Ctrl+Z", redo: "Ctrl+Shift+Z" };
}

/** The keyboard half. Mounted once, next to the toast. */
function useUndoKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const redo = k === "y" || (k === "z" && e.shiftKey);
      if (k !== "z" && !redo) return;
      if (isEditing(e.target)) return;
      e.preventDefault();
      const s = useStore.getState();
      if (redo) s.redo();
      else s.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * What just happened, and the way back from it.
 *
 * A deleted row leaves nothing behind on the page to click, so the toast is the only
 * thing standing between a mis-aimed ✕ and a bullet that is simply gone. Undoing from
 * the keyboard announces itself here too — the change is often on a part of the page
 * you are not looking at, and silence would read as the shortcut not working.
 */
export default function UndoToast() {
  const t = useT();
  const keys = useShortcut();
  const notice = useStore((s) => s.notice);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  useUndoKeys();

  // every announcement is a new object, so a second deletion restarts the clock
  // instead of inheriting what was left of the first one's
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => useStore.getState().clearNotice(), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const back = notice.undone;
  const stuck = back ? !canRedo : !canUndo;

  return (
    <div
      className="noprint fixed bottom-5 left-1/2 z-40 -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        className="card flex items-center gap-3 rounded-[12px] py-[7px] pl-3.5 pr-2"
        style={{ boxShadow: "var(--lift-2)" }}
      >
        <span className="text-[12.5px]" style={{ color: "var(--ink2)" }}>
          {back ? `${t("undone")} — ${notice.label}` : notice.label}
        </span>
        <button
          className="btn btn-sm btn-primary"
          disabled={stuck}
          onClick={() => (back ? useStore.getState().redo() : useStore.getState().undo())}
        >
          {back ? t("redo") : t("undo")}
          {(back ? keys.redo : keys.undo) && (
            <span className="mono opacity-60">{back ? keys.redo : keys.undo}</span>
          )}
        </button>
        <button
          className="ibtn"
          title={t("dismiss")}
          onClick={() => useStore.getState().clearNotice()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * The same undo, parked in the header — findable when the toast has already timed
 * out, and the only hint that the shortcut exists at all.
 */
export function UndoButton() {
  const t = useT();
  const keys = useShortcut();
  const label = useStore((s) => s.past[0]?.label);

  return (
    <button
      className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-[13px] transition disabled:opacity-30"
      style={{ background: "var(--plane)", border: "1px solid var(--ring)", color: "var(--ink2)" }}
      disabled={!label}
      onClick={() => useStore.getState().undo()}
      title={label ? `${t("undo")}: ${label}${keys.undo ? ` (${keys.undo})` : ""}` : t("nothingToUndo")}
    >
      ↺
    </button>
  );
}

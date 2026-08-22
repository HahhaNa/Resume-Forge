"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useBackup } from "@/lib/backup";
import { useT } from "@/lib/i18n";
import UndoToast, { UndoButton } from "@/components/ui/Undo";

/**
 * What the header says about where your data is. The states that need doing
 * something about are coloured, and all of them are explained on the Data tab.
 */
const SAVED_AS: Record<string, { text: string; color: string }> = {
  on: { text: "saved · file", color: "var(--good)" },
  off: { text: "saved · local", color: "var(--faint)" },
  unsupported: { text: "saved · local", color: "var(--faint)" },
  locked: { text: "backup locked", color: "var(--warn)" },
  conflict: { text: "backup paused", color: "var(--serious)" },
  error: { text: "backup failed", color: "var(--crit)" },
};

const TABS = [
  { href: "/", key: "nav_resume" as const },
  { href: "/library", key: "nav_library" as const },
  { href: "/applications", key: "nav_apps" as const },
  { href: "/practice", key: "nav_practice" as const },
  { href: "/data", key: "nav_data" as const },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const t = useT();
  const { theme, setTheme, hydrated } = useStore();
  const status = useBackup((b) => b.status);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

  // the backup file handle lives in IndexedDB, so it can only be picked up
  // after mount — and it belongs here, not on the Data tab, because editing
  // happens on every other tab
  useEffect(() => {
    void useBackup.getState().init();
  }, []);

  return (
    <div className="print-shell min-h-screen">
      <header
        className="noprint sticky top-0 z-20 flex h-[54px] flex-wrap items-center gap-x-5 px-[18px]"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--ring)" }}
      >
        <Link href="/" className="text-[17px] font-bold tracking-[-.01em]">
          Resume<span style={{ color: "var(--accent)" }}>Forge</span>
        </Link>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? path === "/" : path.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="rounded-[9px] px-[13px] py-[7px] text-[13px] leading-none transition"
                style={{
                  color: active ? "var(--ink)" : "var(--muted)",
                  fontWeight: active ? 500 : 400,
                  background: active ? "var(--plane)" : "transparent",
                  boxShadow: active ? "inset 0 0 0 1px var(--ring)" : "none",
                }}
              >
                {t(tab.key)}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/data"
            className="mono text-[10.5px]"
            style={{ color: hydrated ? (SAVED_AS[status] ?? SAVED_AS.off).color : "var(--faint)" }}
            title="Where your data is kept"
          >
            {hydrated ? (SAVED_AS[status] ?? SAVED_AS.off).text : "loading…"}
          </Link>
          <UndoButton />
          {/* language lives on the Data page — it is a set-once choice, not a toggle */}
          <button
            className="grid h-[30px] w-[30px] place-items-center rounded-[9px] text-[13px] transition"
            style={{ background: "var(--plane)", border: "1px solid var(--ring)", color: "var(--ink2)" }}
            onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
            title={`Theme: ${theme}`}
          >
            {theme === "dark" ? "◑" : theme === "light" ? "◒" : "◐"}
          </button>
        </div>
      </header>
      <main>{children}</main>
      <UndoToast />
    </div>
  );
}

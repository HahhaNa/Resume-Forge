"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { daysSince, useBackup } from "@/lib/backup";
import { useT } from "@/lib/i18n";
import UndoToast, { UndoButton } from "@/components/ui/Undo";
import BackupInvite from "@/components/BackupInvite";

/**
 * What the header says about where your data is. The states that need doing
 * something about are coloured, and all of them are explained on the Data tab.
 */
const SAVED_AS: Record<string, { text: string; color: string; title: string }> = {
  on: { text: "saved · file", color: "var(--good)", title: "Written to your backup file" },
  off: { text: "saved · local", color: "var(--faint)", title: "Where your data is kept" },
  unsupported: { text: "saved · local", color: "var(--faint)", title: "Where your data is kept" },
  locked: { text: "backup locked", color: "var(--warn)", title: "Permission to write the file lapsed — click to reconnect" },
  conflict: { text: "backup paused", color: "var(--serious)", title: "The file disagrees with this browser — click to choose" },
  error: { text: "backup failed", color: "var(--crit)", title: "The last write did not land — click for the reason" },
};

/**
 * Not a status of the backup system — the absence of one. `off` renders as a
 * grey "saved · local", which is true and reads as *fine*, when what it
 * actually means is that this browser holds the only copy of the user's job
 * hunt. Once there is real work to lose and no second copy anywhere, the
 * badge should say so in a colour, because nothing else in the app will.
 */
const AT_RISK = {
  text: "1 copy only",
  color: "var(--warn)",
  title: "This browser holds the only copy — click to set up a backup",
};

/** Long enough that an occasional exporter is left alone, short enough to matter. */
const STALE_DAYS = 7;

const TABS = [
  { href: "/", key: "nav_resume" as const },
  { href: "/library", key: "nav_library" as const },
  { href: "/tailor", key: "nav_tailor" as const },
  { href: "/applications", key: "nav_apps" as const },
  { href: "/practice", key: "nav_practice" as const },
  { href: "/data", key: "nav_data" as const },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const t = useT();
  const { theme, setTheme, hydrated } = useStore();
  const ownWorkAt = useStore((s) => s.ownWorkAt);
  const status = useBackup((b) => b.status);
  const lastExportAt = useBackup((b) => b.lastExportAt);

  // no file connected, nothing exported lately, and something worth losing
  const exported = daysSince(lastExportAt);
  const atRisk =
    (status === "off" || status === "unsupported") &&
    !!ownWorkAt &&
    (exported === null || exported >= STALE_DAYS);
  const badge = atRisk ? AT_RISK : (SAVED_AS[status] ?? SAVED_AS.off);

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
            style={{ color: hydrated ? badge.color : "var(--faint)" }}
            title={hydrated ? badge.title : "Where your data is kept"}
          >
            {hydrated ? badge.text : "loading…"}
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
      <BackupInvite />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

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

  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
  }, [theme]);

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
          <span className="mono text-[10.5px]" style={{ color: "var(--faint)" }}>
            {hydrated ? "saved · local" : "loading…"}
          </span>
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
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, ChevronRight, LayoutGrid, Sliders } from "lucide-react";

const NAV = [
  { href: "/settings",         label: "Overview",           icon: LayoutGrid, exact: true },
  { href: "/settings/ai",      label: "AI Configuration",   icon: Bot,        exact: false },
  { href: "/settings/reports", label: "Reports & Alerts",   icon: Sliders,    exact: false },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 gap-0">
      {/* Left settings nav */}
      <aside className="hidden w-56 shrink-0 border-r border-[var(--border)] md:flex md:flex-col">
        <div className="p-4 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Settings</p>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "bg-accent/10 font-semibold text-accent"
                    : "text-[var(--fg-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Right content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

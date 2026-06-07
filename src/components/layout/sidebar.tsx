"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  Filter,
  LayoutDashboard,
  Star,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, desc: "Market overview" },
  { href: "/screener", label: "Screener", icon: Filter, desc: "Find stocks" },
  { href: "/portfolio", label: "Portfolio", icon: Wallet, desc: "Your holdings" },
  { href: "/trading", label: "Trading", icon: ArrowLeftRight, desc: "BUY/SELL ledger" },
  { href: "/analysis", label: "Analysis", icon: BarChart3, desc: "Scores & picks" },
  { href: "/watchlist", label: "Watchlist", icon: Star, desc: "Favorites" },
  { href: "/ai-analyst", label: "AI Analyst", icon: Bot, desc: "Ask anything" },
];

export function Sidebar({
  user,
}: {
  user?: { name?: string | null; email?: string | null } | null;
}) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) return null;

  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo size="md" />
          <div>
            <div className="font-semibold tracking-tight text-[var(--fg)]">VN Stocks</div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--fg-subtle)]">
              Vietnam Market
            </div>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                active
                  ? "bg-[var(--accent-bg)] text-[var(--accent)] ring-1 ring-[var(--accent)]/25"
                  : "text-[var(--fg-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active && "text-[var(--accent)]")} />
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-[10px] text-[var(--fg-subtle)] group-hover:text-[var(--fg-muted)]">
                  {item.desc}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-4">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-xs font-bold text-[var(--accent)]">
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--fg)]">
                  {user.name || "Investor"}
                </div>
                <div className="truncate text-[10px] text-[var(--fg-subtle)]">{user.email}</div>
              </div>
            </div>
            <SignOutButton />
          </div>
        ) : (
          <Link
            href="/login"
            className="block rounded-xl bg-[var(--accent)] px-3 py-2.5 text-center text-sm font-semibold text-white shadow-md transition hover:opacity-90"
          >
            Sign in to save data
          </Link>
        )}
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { NavLink } from "@/components/layout/nav-link";
import { navItems } from "@/components/layout/nav-items";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

type SidebarProps = {
  user?: { name?: string | null; email?: string | null } | null;
  compact?: boolean;
  mobile?: boolean;
  open?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({
  user,
  compact = false,
  mobile = false,
  open = false,
  onClose,
  onNavigate,
  className,
}: SidebarProps) {
  const showLabels = !compact;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[var(--border)] bg-[var(--sidebar)] backdrop-blur-xl",
        compact ? "w-[4.5rem]" : "w-[248px]",
        mobile &&
          "fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,280px)] shadow-2xl transition-transform duration-200 ease-out safe-top safe-bottom",
        mobile && (open ? "translate-x-0" : "-translate-x-full"),
        className,
      )}
      aria-hidden={mobile ? !open : undefined}
    >
      <div
        className={cn(
          "flex items-center border-b border-[var(--border)]",
          compact ? "justify-center px-2 py-4" : "justify-between px-5 py-5",
        )}
      >
        {compact ? (
          <Link href="/" title="VN Stocks home" onClick={onNavigate}>
            <BrandLogo size="sm" />
          </Link>
        ) : (
          <>
            <Link href="/" className="flex min-w-0 items-center gap-3" onClick={onNavigate}>
              <BrandLogo size="md" />
              <div className="min-w-0">
                <div className="font-semibold tracking-tight text-[var(--fg)]">VN Stocks</div>
                <div className="text-[10px] font-medium uppercase tracking-widest text-[var(--fg-subtle)]">
                  Vietnam Market
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              {!mobile && <ThemeToggle />}
              {mobile && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-[var(--bg-secondary)]"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain",
          compact ? "p-2" : "p-3",
        )}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            desc={item.desc}
            icon={item.icon}
            compact={compact}
            onClick={onNavigate}
          />
        ))}
      </nav>

      {!compact && (
        <div className="shrink-0 border-t border-[var(--border)] p-4 safe-bottom">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-xs font-bold text-[var(--accent)]">
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
              onClick={onNavigate}
              className="block rounded-xl bg-[var(--accent)] px-3 py-2.5 text-center text-sm font-semibold text-white shadow-md transition hover:opacity-90"
            >
              Sign in to save data
            </Link>
          )}
        </div>
      )}

      {compact && (
        <div className="flex shrink-0 justify-center border-t border-[var(--border)] p-2 safe-bottom">
          <ThemeToggle />
        </div>
      )}
    </aside>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bot, ChevronUp, LogOut, Settings, Sliders } from "lucide-react";

type Props = {
  user: { name?: string | null; email?: string | null } | null | undefined;
  onNavigate?: () => void;
};

export function UserMenu({ user, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!user) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="block rounded-xl bg-accent px-3 py-2.5 text-center text-sm font-semibold text-accent-fg shadow-md transition hover:opacity-90"
      >
        Sign in to save data
      </Link>
    );
  }

  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();

  const handleSignOut = () => {
    setOpen(false);
    router.replace("/");
    void signOut({ redirect: false }).then(() => router.refresh());
  };

  const handleNav = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={ref} className="relative">
      {/* Popup menu — renders above the trigger */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl ring-1 ring-[var(--border)]">
          {/* User header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-sm font-bold text-accent">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--fg)]">
                {user.name || "Investor"}
              </p>
              <p className="truncate text-[11px] text-[var(--fg-subtle)]">{user.email}</p>
            </div>
          </div>

          {/* Menu items */}
          <nav className="p-1.5 space-y-0.5">
            <Link
              href="/settings"
              onClick={handleNav}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]"
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>
            <Link
              href="/settings/ai"
              onClick={handleNav}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]"
            >
              <Bot className="h-4 w-4 shrink-0" />
              AI Configuration
            </Link>
            <Link
              href="/settings/reports"
              onClick={handleNav}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]"
            >
              <Sliders className="h-4 w-4 shrink-0" />
              Reports & Alerts
            </Link>

            <div className="my-1 border-t border-[var(--border)]" />

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </nav>
        </div>
      )}

      {/* Trigger — same visual as old user card, now clickable */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)] transition-all hover:ring-[var(--border-strong)]"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-xs font-bold text-accent">
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-[var(--fg)]">
            {user.name || "Investor"}
          </p>
          <p className="truncate text-[10px] text-[var(--fg-subtle)]">{user.email}</p>
        </div>
        <ChevronUp
          className={`h-4 w-4 shrink-0 text-[var(--fg-subtle)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}

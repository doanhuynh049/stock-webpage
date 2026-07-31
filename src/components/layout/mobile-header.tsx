"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--ticker-bg)] px-3 backdrop-blur-md safe-top md:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--ticker-border)] bg-black/30 text-[var(--ticker-fg)]"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/" className="flex min-w-0 flex-1 items-center gap-2">
        <BrandLogo size="sm" />
        <span className="truncate text-sm font-semibold text-[var(--fg)]">VN Stocks</span>
      </Link>
      <ThemeToggle />
    </header>
  );
}

"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
};

function NavLinkPending({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  const { pending } = useLinkStatus();

  return (
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        active && "text-[var(--accent)]",
        pending && !active && "animate-pulse",
      )}
    />
  );
}

export function NavLink({ href, label, desc, icon: Icon }: NavLinkProps) {
  const pathname = usePathname();

  const active =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
        active
          ? "bg-[var(--accent-bg)] text-[var(--accent)] ring-1 ring-[var(--accent)]/25"
          : "text-[var(--fg-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]",
      )}
    >
      <NavLinkPending icon={Icon} active={active} />
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[10px] text-[var(--fg-subtle)] group-hover:text-[var(--fg-muted)]">
          {desc}
        </div>
      </div>
    </Link>
  );
}

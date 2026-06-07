import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel = "Sign in",
  actionHref = "/login",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="hero-gradient rounded-2xl p-5 ring-1 ring-[var(--border)]">
        <Icon className="h-10 w-10 text-accent" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-[var(--fg)]">{title}</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        {description}
      </p>
      <Link href={actionHref} className="mt-8">
        <Button size="lg">{actionLabel}</Button>
      </Link>
    </div>
  );
}

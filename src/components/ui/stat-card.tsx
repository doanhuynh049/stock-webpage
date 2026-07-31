import { cn, changeColor } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  subValue,
  change,
  icon: Icon,
  accent,
  valueClass,
}: {
  label: string;
  value: string;
  subValue?: string;
  change?: number;
  icon?: LucideIcon;
  accent?: "accent" | "neutral" | "violet" | "amber";
  /** Optional override for the value text colour */
  valueClass?: string;
}) {
  const accents = {
    accent: "border-t-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_6%,var(--card))]",
    neutral: "",
    violet: "border-t-2 border-violet-500/40 bg-[color-mix(in_srgb,violet_5%,var(--card))]",
    amber: "border-t-2 border-amber-500/40 bg-[color-mix(in_srgb,amber_5%,var(--card))]",
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        accent && accents[accent],
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {label}
          </p>
          <p className={cn("mt-2 font-data text-2xl font-bold tracking-tight", valueClass ?? "text-[var(--fg)]")}>
            {value}
          </p>
          {subValue && (
            <p className="mt-1 text-xs text-muted">{subValue}</p>
          )}
          {change !== undefined && (
            <p className={cn("mt-1 font-data text-sm font-medium", changeColor(change))}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </p>
          )}
        </div>
        {Icon && (
          <div className="rounded-xl bg-[var(--bg-secondary)] p-2.5 ring-1 ring-[var(--border)]">
            <Icon className="h-4 w-4 text-muted" />
          </div>
        )}
      </div>
    </Card>
  );
}

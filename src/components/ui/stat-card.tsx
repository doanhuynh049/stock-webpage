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
  accent?: "emerald" | "cyan" | "violet" | "amber";
  /** Optional override for the value text colour, e.g. "text-emerald-500" */
  valueClass?: string;
}) {
  const accents = {
    emerald: "from-emerald-500/10 to-transparent",
    cyan: "from-cyan-500/10 to-transparent",
    violet: "from-violet-500/10 to-transparent",
    amber: "from-amber-500/10 to-transparent",
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        accent && `bg-gradient-to-br ${accents[accent]}`,
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
            {label}
          </p>
          <p className={cn("mt-2 font-mono text-2xl font-bold tracking-tight", valueClass ?? "text-[var(--fg)]")}>
            {value}
          </p>
          {subValue && (
            <p className="mt-1 text-xs text-muted">{subValue}</p>
          )}
          {change !== undefined && (
            <p className={cn("mt-1 font-mono text-sm font-medium", changeColor(change))}>
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

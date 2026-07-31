import { formatPercent, cn } from "@/lib/utils";
import { TrendingDown, TrendingUp } from "lucide-react";

export function ChangeBadge({
  value,
  className,
  showIcon = true,
}: {
  value: number;
  className?: string;
  showIcon?: boolean;
}) {
  const positive = value > 0;
  const negative = value < 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-data text-sm font-semibold",
        positive && "bg-[var(--gain-bg)] text-gain",
        negative && "bg-[var(--loss-bg)] text-loss",
        !positive && !negative && "bg-[var(--bg-secondary)] text-subtle",
        className,
      )}
    >
      {showIcon && positive && <TrendingUp className="h-3 w-3" />}
      {showIcon && negative && <TrendingDown className="h-3 w-3" />}
      {formatPercent(value)}
    </span>
  );
}

import { getSectorColor } from "@/lib/sector-colors";
import { cn } from "@/lib/utils";
import type { SectorPerformance } from "@/types/stock";

export function SectorHeatmap({ sectors }: { sectors: SectorPerformance[] }) {
  const sorted = [...sectors].sort(
    (a, b) => b.changePercent - a.changePercent,
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {sorted.map((sector) => {
        const isPositive = sector.changePercent >= 0;
        const color = getSectorColor(sector.sector);
        const intensity = Math.min(Math.abs(sector.changePercent) / 3, 1);

        return (
          <div
            key={sector.sector}
            className={cn(
              "group relative overflow-hidden rounded-xl p-4 transition-all duration-300 hover:scale-[1.02]",
              "ring-1 ring-[var(--border)]",
            )}
            style={{
              background: isPositive
                ? `linear-gradient(135deg, ${color}${Math.round(intensity * 25).toString(16).padStart(2, "0")} 0%, transparent 100%)`
                : `linear-gradient(135deg, rgba(239,68,68,${intensity * 0.15}) 0%, transparent 100%)`,
            }}
          >
            <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(sector.marketCapWeight ?? 10) * 3}%`,
                  background: color,
                }}
              />
            </div>
            <div className="text-xs font-medium text-muted">{sector.sector}</div>
            <div
              className={cn(
                "mt-1 font-mono text-lg font-bold",
                isPositive ? "text-success" : "text-danger",
              )}
            >
              {isPositive ? "+" : ""}
              {sector.changePercent.toFixed(1)}%
            </div>
            {sector.marketCapWeight && (
              <div className="mt-1 text-[10px] text-subtle">
                {sector.marketCapWeight}% weight
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

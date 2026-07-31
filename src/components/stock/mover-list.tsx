import Link from "next/link";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import type { Stock } from "@/types/stock";
import { formatVolume } from "@/lib/utils";

export function MoverList({
  stocks,
  type,
}: {
  stocks: Stock[];
  type: "gainers" | "losers";
}) {
  const maxChange = Math.max(...stocks.map((s) => Math.abs(s.changePercent)), 1);

  return (
    <div className="space-y-1">
      {stocks.map((stock, i) => (
        <Link
          key={stock.symbol}
          href={`/stocks/${stock.symbol}`}
          className="interactive-row group flex items-center gap-3 px-3 py-2.5"
        >
          <span className="w-4 font-data text-xs text-subtle">{i + 1}</span>
          <StockAvatar symbol={stock.symbol} sector={stock.sector} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[var(--fg)] group-hover:text-accent">
                {stock.symbol}
              </span>
              <ChangeBadge value={stock.changePercent} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                <div
                  className={`h-full rounded-full ${type === "gainers" ? "bg-[var(--gain)]" : "bg-[var(--loss)]"}`}
                  style={{
                    width: `${(Math.abs(stock.changePercent) / maxChange) * 100}%`,
                  }}
                />
              </div>
              <span className="font-data text-[10px] text-subtle">
                {formatVolume(stock.volume)}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

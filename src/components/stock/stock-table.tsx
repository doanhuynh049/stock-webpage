import Link from "next/link";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { formatVolume } from "@/lib/utils";
import type { Stock } from "@/types/stock";

export function StockTable({ stocks }: { stocks: Stock[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
            <th className="pb-3 pr-4">Ticker</th>
            <th className="pb-3 pr-4">Price</th>
            <th className="pb-3 pr-4">Change</th>
            <th className="pb-3 pr-4">Volume</th>
            <th className="pb-3">Sector</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr
              key={stock.symbol}
              className="group border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <td className="py-3.5 pr-4">
                <Link
                  href={`/stocks/${stock.symbol}`}
                  className="flex items-center gap-3"
                >
                  <StockAvatar symbol={stock.symbol} sector={stock.sector} size="sm" />
                  <div>
                    <div className="font-semibold text-[var(--fg)] group-hover:text-accent">
                      {stock.symbol}
                    </div>
                    <div className="text-xs text-muted">{stock.name}</div>
                  </div>
                </Link>
              </td>
              <td className="py-3.5 pr-4 font-mono font-medium text-[var(--fg)]">
                {stock.price.toLocaleString()}
              </td>
              <td className="py-3.5 pr-4">
                <ChangeBadge value={stock.changePercent} />
              </td>
              <td className="py-3.5 pr-4 font-mono text-muted">
                {formatVolume(stock.volume)}
              </td>
              <td className="py-3.5 text-muted">{stock.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

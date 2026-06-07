import Link from "next/link";
import type { PortfolioHolding } from "@/lib/db/advisory-portfolio";
import { formatPriceK } from "@/lib/utils";

export function HoldingsList({
  holdings,
  totalCostBasis,
}: {
  holdings: PortfolioHolding[];
  totalCostBasis: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] font-semibold uppercase tracking-wider text-subtle">
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Exch</th>
            <th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2 text-right">Shares</th>
            <th className="px-3 py-2 text-right">Avg (K)</th>
            <th className="px-3 py-2 text-right">Cost (K)</th>
            <th className="px-3 py-2 text-right">3M Tgt</th>
            <th className="px-3 py-2 text-right">LT Tgt</th>
            <th className="px-3 py-2 text-right">Wt%</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const weight =
              totalCostBasis > 0 ? (h.costBasis / totalCostBasis) * 100 : 0;
            return (
              <tr
                key={h.id}
                className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--card-hover)]"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/stocks/${h.symbol}`}
                    className="font-semibold text-accent hover:underline"
                  >
                    {h.symbol}
                  </Link>
                </td>
                <td
                  className="max-w-[160px] truncate px-3 py-2 text-muted"
                  title={h.name ?? undefined}
                >
                  {h.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted">{h.exchange ?? "—"}</td>
                <td
                  className="max-w-[120px] truncate px-3 py-2 text-muted"
                  title={h.sector ?? undefined}
                >
                  {h.sector ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {h.shares.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {formatPriceK(h.avgBuyPrice)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-[var(--fg)]">
                  {formatPriceK(h.costBasis, 0)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {h.target3Month && h.target3Month > 0
                    ? formatPriceK(h.target3Month)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted">
                  {h.targetLongTerm && h.targetLongTerm > 0
                    ? formatPriceK(h.targetLongTerm)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-subtle">
                  {weight.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        {holdings.length > 0 && (
          <tfoot>
            <tr className="bg-[var(--bg-secondary)] font-semibold">
              <td colSpan={6} className="px-3 py-2 text-right text-subtle">
                Total
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {formatPriceK(totalCostBasis, 0)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

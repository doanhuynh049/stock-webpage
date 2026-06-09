"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import type { Stock } from "@/types/stock";

type SortKey = "symbol" | "price" | "change" | "pe" | "roe" | "growth" | "rsi" | "sector";

function sortStocks(rows: Stock[], key: SortKey | null, dir: "asc" | "desc"): Stock[] {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "symbol":
        cmp = compareStrings(a.symbol, b.symbol);
        break;
      case "sector":
        cmp = compareStrings(a.sector, b.sector);
        break;
      case "price":
        cmp = compareNumbers(a.price, b.price);
        break;
      case "change":
        cmp = compareNumbers(a.changePercent, b.changePercent);
        break;
      case "pe":
        cmp = compareNumbers(a.pe || null, b.pe || null);
        break;
      case "roe":
        cmp = compareNumbers(a.roe, b.roe);
        break;
      case "growth":
        cmp = compareNumbers(a.revenueGrowth, b.revenueGrowth);
        break;
      case "rsi":
        cmp = compareNumbers(a.rsi, b.rsi);
        break;
    }
    return applySortDir(cmp, dir);
  });
}

export function ScreenerResultsTable({ stocks }: { stocks: Stock[] }) {
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("symbol", "asc");
  const sorted = useMemo(
    () => sortStocks(stocks, sortKey, sortDir),
    [stocks, sortKey, sortDir],
  );

  return (
    <div className="table-scroll overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
            <SortableTableHeader
              label="Stock"
              column="symbol"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="Price"
              column="price"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="Change"
              column="change"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="PE"
              column="pe"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="ROE"
              column="roe"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="Growth"
              column="growth"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3 pr-4"
            />
            <SortableTableHeader
              label="RSI"
              column="rsi"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              className="pb-3"
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.symbol}
              className="group border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-secondary)]"
            >
              <td className="py-3.5 pr-4">
                <Link href={`/stocks/${s.symbol}`} className="flex items-center gap-3">
                  <StockAvatar symbol={s.symbol} sector={s.sector} size="sm" />
                  <div>
                    <div className="font-semibold text-[var(--fg)] group-hover:text-accent">
                      {s.symbol}
                    </div>
                    <div className="text-xs text-muted">{s.sector}</div>
                  </div>
                </Link>
              </td>
              <td className="py-3.5 pr-4 font-mono font-medium">{s.price.toLocaleString()}</td>
              <td className="py-3.5 pr-4">
                <ChangeBadge value={s.changePercent} />
              </td>
              <td className="py-3.5 pr-4">
                <span className={`font-mono ${s.pe > 0 && s.pe < 12 ? "text-success" : ""}`}>
                  {s.pe || "—"}
                </span>
              </td>
              <td className="py-3.5 pr-4">
                <span className={`font-mono ${s.roe >= 20 ? "text-success" : ""}`}>
                  {s.roe}%
                </span>
              </td>
              <td className="py-3.5 pr-4">
                <span className={`font-mono ${s.revenueGrowth >= 20 ? "text-success" : ""}`}>
                  {s.revenueGrowth}%
                </span>
              </td>
              <td className="py-3.5">
                <span
                  className={`font-mono ${s.rsi < 30 ? "text-cyan-600 dark:text-cyan-400" : s.rsi > 70 ? "text-danger" : ""}`}
                >
                  {s.rsi}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

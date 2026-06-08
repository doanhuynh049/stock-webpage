import { redirect } from "next/navigation";
import Link from "next/link";
import { Filter, Sparkles } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { getSectors, screenStocks } from "@/lib/stocks";
import { ScreenerForm } from "@/components/screener/screener-form";
import {
  normalizeScreenerParams,
  parseScreenerFilters,
  SCREENER_DEFAULTS,
  SCREENER_DEFAULTS_LABEL,
  screenerDefaultsQuery,
  screenerParamsNeedDefaults,
} from "@/lib/screener-defaults";

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<{
    maxPe?: string;
    minRevenueGrowth?: string;
    minRoe?: string;
    maxRsi?: string;
    sector?: string;
  }>;
}) {
  const params = await searchParams;

  if (screenerParamsNeedDefaults(params)) {
    redirect(`/screener?${screenerDefaultsQuery()}`);
  }

  const normalized = normalizeScreenerParams(params);
  const filters = parseScreenerFilters(params);
  const sectors = await getSectors();
  const results = await screenStocks(filters);

  const activeFilters = [
    filters.maxPe != null && `PE < ${filters.maxPe}`,
    filters.minRevenueGrowth != null && `Growth > ${filters.minRevenueGrowth}%`,
    filters.minRoe != null && `ROE > ${filters.minRoe}%`,
    filters.maxRsi != null && `RSI < ${filters.maxRsi}`,
    filters.sector && filters.sector !== "All" && filters.sector,
  ].filter(Boolean);

  const isDefaultRun =
    normalized.maxPe === SCREENER_DEFAULTS.maxPe &&
    normalized.minRevenueGrowth === SCREENER_DEFAULTS.minRevenueGrowth &&
    normalized.minRoe === SCREENER_DEFAULTS.minRoe &&
    normalized.maxRsi === SCREENER_DEFAULTS.maxRsi &&
    !normalized.sector;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Stock Screener"
        description="Discover undervalued opportunities with fundamental and technical filters"
        badge={
          <Badge variant="info" className="px-3 py-1">
            <Filter className="mr-1 inline h-3 w-3" />
            {results.length} matches
          </Badge>
        }
      />

      <Card glow>
        <CardTitle>Filter Criteria</CardTitle>
        <ScreenerForm sectors={sectors} defaults={normalized} />
        {isDefaultRun && (
          <p className="mt-4 flex items-center gap-2 text-xs text-subtle">
            <Sparkles className="h-3 w-3 text-accent" />
            Default screen: {SCREENER_DEFAULTS_LABEL}
          </p>
        )}
        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.map((f) => (
              <Badge key={f as string} variant="success">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Results</CardTitle>
        {results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  <th className="pb-3 pr-4">Stock</th>
                  <th className="pb-3 pr-4">Price</th>
                  <th className="pb-3 pr-4">Change</th>
                  <th className="pb-3 pr-4">PE</th>
                  <th className="pb-3 pr-4">ROE</th>
                  <th className="pb-3 pr-4">Growth</th>
                  <th className="pb-3">RSI</th>
                </tr>
              </thead>
              <tbody>
                {results.map((s) => (
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
                      <span className={`font-mono ${s.rsi < 30 ? "text-cyan-600 dark:text-cyan-400" : s.rsi > 70 ? "text-danger" : ""}`}>
                        {s.rsi}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] py-12 text-center">
            <p className="text-sm text-muted">No stocks match your criteria.</p>
            <p className="mt-1 text-xs text-subtle">Try relaxing the filters above.</p>
            <Link
              href={`/screener?${screenerDefaultsQuery()}`}
              className="mt-3 inline-block text-xs text-accent hover:underline"
            >
              Reset to default screen
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

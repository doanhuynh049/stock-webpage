import { redirect } from "next/navigation";
import Link from "next/link";
import { Filter, Sparkles } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { getSectors, screenStocks } from "@/lib/stocks";
import { ScreenerForm } from "@/components/screener/screener-form";
import { ScreenerResultsTable } from "@/components/screener/screener-results-table";
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
          <ScreenerResultsTable stocks={results} />
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

/** Default screener filters applied on first visit to `/screener`. */
export const SCREENER_DEFAULTS = {
  maxPe: "18",
  minRevenueGrowth: "12",
  minRoe: "14",
  maxRsi: "55",
} as const;

export function screenerDefaultsQuery(): string {
  return new URLSearchParams({ ...SCREENER_DEFAULTS }).toString();
}

function parseFilterNum(
  raw: string | undefined,
  fallback: string,
): number | undefined {
  const value = raw?.trim() || fallback;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function parseScreenerFilters(params: {
  maxPe?: string;
  minRevenueGrowth?: string;
  minRoe?: string;
  maxRsi?: string;
  sector?: string;
}) {
  const maxPe = parseFilterNum(params.maxPe, SCREENER_DEFAULTS.maxPe);
  return {
    // PE filter only when positive (PE < 0 is invalid)
    maxPe: maxPe != null && maxPe > 0 ? maxPe : parseFloat(SCREENER_DEFAULTS.maxPe),
    minRevenueGrowth: parseFilterNum(
      params.minRevenueGrowth,
      SCREENER_DEFAULTS.minRevenueGrowth,
    ),
    minRoe: parseFilterNum(params.minRoe, SCREENER_DEFAULTS.minRoe),
    maxRsi: parseFilterNum(params.maxRsi, SCREENER_DEFAULTS.maxRsi),
    sector: params.sector?.trim() || undefined,
  };
}

export function normalizeScreenerParams(params: {
  maxPe?: string;
  minRevenueGrowth?: string;
  minRoe?: string;
  maxRsi?: string;
  sector?: string;
}): Record<string, string> {
  const filters = parseScreenerFilters(params);
  const out: Record<string, string> = {
    maxPe: String(filters.maxPe),
    minRevenueGrowth: String(filters.minRevenueGrowth),
    minRoe: String(filters.minRoe),
    maxRsi: String(filters.maxRsi),
  };
  if (filters.sector) out.sector = filters.sector;
  return out;
}

/** True when URL params are missing or invalid (e.g. maxPe=0). */
export function screenerParamsNeedDefaults(params: {
  maxPe?: string;
  minRevenueGrowth?: string;
  minRoe?: string;
  maxRsi?: string;
  sector?: string;
}): boolean {
  const hasAny = Object.values(params).some((v) => v != null && v !== "");
  if (!hasAny) return true;
  const maxPe = parseFloat(params.maxPe ?? "");
  if (params.maxPe != null && params.maxPe !== "" && (!Number.isFinite(maxPe) || maxPe <= 0)) {
    return true;
  }
  return false;
}

export const SCREENER_DEFAULTS_LABEL =
  "PE < 18 · Growth > 12% · ROE > 14% · RSI < 55";

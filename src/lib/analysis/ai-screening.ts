import type { IndexStock } from "@/lib/analysis/index-universe";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";
import {
  loadAnalysisSnapshotStore,
  type AnalysisSnapshotStore,
} from "@/lib/db/analysis-snapshots";
import { getStock, priceKToVnd } from "@/lib/market-service";

/**
 * AI Screening Rule — Level 2, Step 1 + Step 2 (rule-based, no AI).
 *
 * Data-availability caveats (the DB does not track these as first-class
 * fields, so we use the closest honest proxy instead of fabricating them):
 * - "Revenue CAGR" → proxied by YoY `revenueGrowth` (no multi-year revenue
 *   series is stored).
 * - "EPS growth 3y" → proxied by YoY `epsGrowth` (same reason).
 * - "Free Cash Flow" → not stored at all. The 2-consecutive-year-negative
 *   hard filter can never be evaluated; it always resolves to
 *   dataUnavailable and a neutral (50) sub-score rather than a guess.
 * - "Liquidity" → proxied by `currentPrice * volumeMa` (avg daily trading
 *   value isn't stored directly; this is the standard derivation).
 */

export {
  DEFAULT_HARD_FILTER_THRESHOLDS,
  DEFAULT_SCREENING_WEIGHTS,
  type HardFilterThresholds,
  type ScreeningWeights,
} from "@/lib/analysis/ai-screening-config";
import {
  DEFAULT_HARD_FILTER_THRESHOLDS,
  DEFAULT_SCREENING_WEIGHTS,
  type HardFilterThresholds,
  type ScreeningWeights,
} from "@/lib/analysis/ai-screening-config";

export type ScreeningMetrics = {
  roe: number | null;
  revenueCagr: number | null;
  epsGrowth3y: number | null;
  debtToEquity: number | null;
  peg: number | null;
  liquidityVnd: number | null;
  fcfNegative2y: null; // never computable today — see module doc comment
};

export type HardFilterOutcome = {
  passed: boolean;
  reasons: string[];
  dataUnavailable: string[];
};

export type ScreeningSubScores = {
  roe: number;
  cagr: number;
  epsGrowth: number;
  debt: number;
  fcf: number;
  peg: number;
};

export type ScreeningCandidate = {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  metrics: ScreeningMetrics;
  hardFilter: HardFilterOutcome;
  subScores: ScreeningSubScores;
  quantScore: number;
  source: "neon" | "cache" | "market";
};

export type ScreeningRunResult = {
  candidates: ScreeningCandidate[];
  totalScreened: number;
  passedHardFilter: number;
  weights: ScreeningWeights;
  thresholds: HardFilterThresholds;
};

function normalizeWeights(input?: Partial<ScreeningWeights>): ScreeningWeights {
  const merged: ScreeningWeights = { ...DEFAULT_SCREENING_WEIGHTS, ...input };
  const sum =
    merged.roe + merged.revenueCagr + merged.epsGrowth3y + merged.debtToEquity + merged.fcf + merged.peg;
  if (!(sum > 0)) return DEFAULT_SCREENING_WEIGHTS;
  return {
    roe: merged.roe / sum,
    revenueCagr: merged.revenueCagr / sum,
    epsGrowth3y: merged.epsGrowth3y / sum,
    debtToEquity: merged.debtToEquity / sum,
    fcf: merged.fcf / sum,
    peg: merged.peg / sum,
  };
}

function computePeg(peRatio: number | null | undefined, growthPct: number | null | undefined): number | null {
  if (peRatio == null || peRatio <= 0) return null;
  if (growthPct == null || growthPct <= 0) return null;
  return peRatio / growthPct;
}

async function resolveMetrics(
  sym: string,
  store: AnalysisSnapshotStore,
): Promise<{ metrics: ScreeningMetrics; currentPrice: number; source: "neon" | "cache" | "market" }> {
  const resolved = store.resolve(sym);
  const fund = resolved.fund;
  const tech = resolved.tech;

  // technical_snapshot.price is stored in thousands of VND — convert before
  // using it in liquidity math or displaying it. The getStock() fallback
  // below already returns full VND, so it must NOT be converted again.
  let price = resolved.techPrice ? priceKToVnd(resolved.techPrice) : 0;
  let volumeMa = tech?.volumeMa ?? null;
  let source: "neon" | "cache" | "market" =
    resolved.source === "neon" ? "neon" : resolved.source === "cache" ? "cache" : "market";

  if (!price || (fund == null && tech == null)) {
    const stock = await getStock(sym);
    if (!price) price = stock?.price ?? 0;
    if (volumeMa == null) volumeMa = stock?.volume ?? null;
    if (fund == null && tech == null) source = "market";
  }

  const roe = fund?.roe ?? null;
  const revenueCagr = fund?.revenueGrowth ?? null;
  const epsGrowth3y = fund?.epsGrowth ?? null;
  const debtToEquity = fund?.debtToEquity ?? null;
  const peg = computePeg(fund?.peRatio, epsGrowth3y ?? fund?.profitGrowth);
  const liquidityVnd = price > 0 && volumeMa != null && volumeMa > 0 ? price * volumeMa : null;

  return {
    metrics: { roe, revenueCagr, epsGrowth3y, debtToEquity, peg, liquidityVnd, fcfNegative2y: null },
    currentPrice: price,
    source,
  };
}

function evaluateHardFilter(
  metrics: ScreeningMetrics,
  thresholds: HardFilterThresholds,
): HardFilterOutcome {
  const reasons: string[] = [];
  const dataUnavailable: string[] = [];

  if (metrics.roe == null) {
    dataUnavailable.push("roe");
  } else if (metrics.roe < thresholds.minRoe) {
    reasons.push(`ROE ${metrics.roe.toFixed(1)}% < ${thresholds.minRoe}% minimum`);
  }

  if (metrics.debtToEquity == null) {
    dataUnavailable.push("debtToEquity");
  } else if (metrics.debtToEquity > thresholds.maxDebtToEquity) {
    reasons.push(`Debt/Equity ${metrics.debtToEquity.toFixed(2)} > ${thresholds.maxDebtToEquity} maximum`);
  }

  if (metrics.liquidityVnd == null) {
    dataUnavailable.push("liquidity");
  } else if (metrics.liquidityVnd < thresholds.minLiquidityVnd) {
    reasons.push(
      `Liquidity ~${(metrics.liquidityVnd / 1e9).toFixed(2)}B VND/day < ${(thresholds.minLiquidityVnd / 1e9).toFixed(2)}B minimum`,
    );
  }

  // FCF can never be evaluated — no multi-year FCF series is stored. Always
  // "data unavailable", never a rejection reason (would require fabricating).
  dataUnavailable.push("fcf");

  return { passed: reasons.length === 0, reasons, dataUnavailable };
}

/** Min-max normalize to 0–100. `invert` = true means the lowest raw value scores 100 (e.g. Debt/Equity, PEG). */
function normalizeMinMax(value: number | null, values: number[], invert: boolean): number {
  if (value == null) return 50; // neutral when unavailable — never fabricated, never zero-biased
  if (values.length < 2) return 50;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi <= lo) return 50;
  const ratio = (value - lo) / (hi - lo);
  const score = invert ? (1 - ratio) * 100 : ratio * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function screenUniverse(
  universe: IndexStock[],
  opts?: {
    weights?: Partial<ScreeningWeights>;
    thresholds?: Partial<HardFilterThresholds>;
    limit?: number;
    store?: AnalysisSnapshotStore;
  },
): Promise<ScreeningRunResult> {
  const weights = normalizeWeights(opts?.weights);
  const thresholds: HardFilterThresholds = { ...DEFAULT_HARD_FILTER_THRESHOLDS, ...opts?.thresholds };
  const nonEtf = universe.filter((s) => !isEtfSymbol(s.symbol));

  const store = opts?.store ?? (await loadAnalysisSnapshotStore(nonEtf.map((s) => s.symbol)));

  const resolved = await Promise.all(
    nonEtf.map(async (s) => {
      const sym = s.symbol.toUpperCase();
      const { metrics, currentPrice, source } = await resolveMetrics(sym, store);
      const hardFilter = evaluateHardFilter(metrics, thresholds);
      return { stock: s, sym, metrics, currentPrice, source, hardFilter };
    }),
  );

  const passed = resolved.filter((r) => r.hardFilter.passed);

  const roeValues = passed.map((r) => r.metrics.roe).filter((v): v is number => v != null);
  const cagrValues = passed.map((r) => r.metrics.revenueCagr).filter((v): v is number => v != null);
  const epsValues = passed.map((r) => r.metrics.epsGrowth3y).filter((v): v is number => v != null);
  const debtValues = passed.map((r) => r.metrics.debtToEquity).filter((v): v is number => v != null);
  const pegValues = passed.map((r) => r.metrics.peg).filter((v): v is number => v != null);

  const candidates: ScreeningCandidate[] = passed.map((r) => {
    const subScores: ScreeningSubScores = {
      roe: normalizeMinMax(r.metrics.roe, roeValues, false),
      cagr: normalizeMinMax(r.metrics.revenueCagr, cagrValues, false),
      epsGrowth: normalizeMinMax(r.metrics.epsGrowth3y, epsValues, false),
      debt: normalizeMinMax(r.metrics.debtToEquity, debtValues, true),
      fcf: 50, // always neutral — FCF data unavailable, see module doc comment
      peg: normalizeMinMax(r.metrics.peg, pegValues, true),
    };
    const quantScore = Math.round(
      subScores.roe * weights.roe +
        subScores.cagr * weights.revenueCagr +
        subScores.epsGrowth * weights.epsGrowth3y +
        subScores.debt * weights.debtToEquity +
        subScores.fcf * weights.fcf +
        subScores.peg * weights.peg,
    );

    return {
      symbol: r.sym,
      name: r.stock.name,
      sector: r.stock.sector,
      currentPrice: r.currentPrice,
      metrics: r.metrics,
      hardFilter: r.hardFilter,
      subScores,
      quantScore: Math.max(0, Math.min(100, quantScore)),
      source: r.source,
    };
  });

  candidates.sort((a, b) => b.quantScore - a.quantScore);
  const limited = opts?.limit ? candidates.slice(0, opts.limit) : candidates;

  return {
    candidates: limited,
    totalScreened: nonEtf.length,
    passedHardFilter: passed.length,
    weights,
    thresholds,
  };
}

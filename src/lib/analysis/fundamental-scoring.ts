export type FundamentalInputs = {
  roe?: number | null;
  roa?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  revenueGrowth?: number | null;
  profitGrowth?: number | null;
  epsGrowth?: number | null;
  debtToEquity?: number | null;
  netProfitMargin?: number | null;
  grossProfitMargin?: number | null;

  // --- Enrichment fields -----------------------------------------------
  // Stored in fundamental_snapshot but historically dropped at the mapper.
  // `roic` and `currentRatio` are pure FALLBACKS — used only when their
  // primary is absent, so they can only raise a category that would otherwise
  // score zero.
  //
  // `epsGrowth3y` is the one exception: it is PREFERRED over `epsGrowth` when
  // present, because a 3-year series is a genuinely better growth signal than
  // one year and the YoY value was only ever a documented stand-in for it. So
  // this field can move the score of a stock that already had full data — an
  // intended correction, not a silent regression.
  /** Real 3-year EPS growth. Preferred over the YoY `epsGrowth` proxy. */
  epsGrowth3y?: number | null;
  /** Return on invested capital. Quality fallback when `roe` is absent. */
  roic?: number | null;
  /** Stability fallback when `debtToEquity` is absent. */
  currentRatio?: number | null;
  /** Price/cash-flow. The closest stored stand-in for an FCF signal. */
  pCashFlowRatio?: number | null;
};

function interpolate(
  value: number,
  lo: number,
  hi: number,
  ptLo: number,
  ptHi: number,
): number {
  if (hi <= lo) return ptHi;
  const ratio = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return Math.round(ptLo + ratio * (ptHi - ptLo));
}

function qualityScore(f: FundamentalInputs): number {
  let score = 0;
  // ROIC stands in for ROE only when ROE is absent. Both measure return on
  // capital, so using ROIC as a fallback recovers a category that would
  // otherwise score zero — but it never overrides a present ROE, so no stock
  // with complete data changes score.
  const roe = f.roe != null ? f.roe / 100 : f.roic != null ? f.roic / 100 : null;
  if (roe != null) {
    if (roe >= 0.2) score += 20;
    else if (roe >= 0.15) score += interpolate(roe, 0.15, 0.2, 16, 20);
    else if (roe >= 0.1) score += interpolate(roe, 0.1, 0.15, 8, 16);
  }
  const roa = f.roa != null ? f.roa / 100 : null;
  if (roa != null) {
    if (roa >= 0.1) score += 10;
    else if (roa >= 0.07) score += interpolate(roa, 0.07, 0.1, 7, 10);
    else if (roa >= 0.05) score += interpolate(roa, 0.05, 0.07, 4, 7);
  }
  const margin = f.netProfitMargin ?? f.grossProfitMargin;
  if (margin != null) {
    const m = margin > 1 ? margin / 100 : margin;
    if (m >= 0.2) score += 10;
    else if (m >= 0.1) score += interpolate(m, 0.1, 0.2, 6, 10);
    else if (m >= 0.05) score += interpolate(m, 0.05, 0.1, 3, 6);
  }
  return Math.min(40, score);
}

function growthScore(f: FundamentalInputs): number {
  let score = 0;
  const rev = f.revenueGrowth != null ? f.revenueGrowth / 100 : null;
  if (rev != null) {
    if (rev >= 0.2) score += 12;
    else if (rev >= 0.1) score += interpolate(rev, 0.1, 0.2, 8, 12);
    else if (rev >= 0) score += interpolate(rev, 0, 0.1, 4, 8);
  }
  const profit = f.profitGrowth != null ? f.profitGrowth / 100 : null;
  if (profit != null) {
    if (profit >= 0.15) score += 10;
    else if (profit >= 0.05) score += interpolate(profit, 0.05, 0.15, 5, 10);
    else if (profit >= 0) score += interpolate(profit, 0, 0.05, 2, 5);
  }
  // Prefer the real 3-year series over the YoY proxy when it is stored — a
  // single strong or weak year is a much noisier growth signal.
  const epsSource = f.epsGrowth3y ?? f.epsGrowth;
  const eps = epsSource != null ? epsSource / 100 : null;
  if (eps != null) {
    if (eps >= 0.15) score += 8;
    else if (eps >= 0.05) score += interpolate(eps, 0.05, 0.15, 4, 8);
  }
  return Math.min(30, score);
}

function valuationScore(f: FundamentalInputs): number {
  let score = 10;
  if (f.peRatio != null && f.peRatio > 0) {
    if (f.peRatio <= 12) score += 6;
    else if (f.peRatio <= 18) score += interpolate(f.peRatio, 12, 18, 6, 3);
    else if (f.peRatio <= 30) score += interpolate(f.peRatio, 18, 30, 3, 0);
    else score -= 4;
  }
  if (f.pbRatio != null && f.pbRatio > 0) {
    if (f.pbRatio <= 2) score += 4;
    else if (f.pbRatio <= 4) score += interpolate(f.pbRatio, 2, 4, 4, 1);
    else score -= 2;
  }
  return Math.max(0, Math.min(20, score));
}

function stabilityScore(f: FundamentalInputs): number {
  if (f.debtToEquity == null) {
    // Fall back to liquidity when leverage is unknown. A current ratio only
    // speaks to short-term solvency, not capital structure, so it is scored
    // more conservatively than the D/E ladder below and never reaches 10.
    if (f.currentRatio != null) {
      if (f.currentRatio >= 2.0) return 8;
      if (f.currentRatio >= 1.5) return 6;
      if (f.currentRatio >= 1.0) return 4;
      return 1;
    }
    return 5;
  }
  const de = f.debtToEquity;
  if (de < 0.5) return 10;
  if (de < 0.7) return interpolate(de, 0.5, 0.7, 8, 6);
  if (de < 1.0) return interpolate(de, 0.7, 1.0, 6, 3);
  return 0;
}

function penalties(f: FundamentalInputs): number {
  let p = 0;
  const profit = f.profitGrowth != null ? f.profitGrowth / 100 : null;
  if (profit != null && profit < -0.1) p += 15;
  if (f.debtToEquity != null && f.debtToEquity > 1.5) p += 10;
  if (f.peRatio != null && f.peRatio > 40) p += 8;
  return Math.min(50, p);
}

/**
 * Every input the fundamental score can read. Used to measure coverage: a
 * missing field scores zero in its category rather than being excluded, so a
 * stock with few inputs is structurally capped well below 100 and would
 * otherwise be indistinguishable from a genuinely mediocre one.
 */
export const FUNDAMENTAL_INPUT_KEYS = [
  "roe",
  "roa",
  "peRatio",
  "pbRatio",
  "revenueGrowth",
  "profitGrowth",
  "epsGrowth",
  "debtToEquity",
  "netProfitMargin",
  "grossProfitMargin",
] as const satisfies readonly (keyof FundamentalInputs)[];

export const TOTAL_FUNDAMENTAL_INPUTS = FUNDAMENTAL_INPUT_KEYS.length;

/** How many of the scoreable fundamental inputs are actually present. */
export function countFundamentalInputs(f: FundamentalInputs): number {
  return FUNDAMENTAL_INPUT_KEYS.filter((k) => f[k] != null).length;
}

export type FundamentalBreakdown = {
  qualityScore: number;
  growthScore: number;
  valuationScore: number;
  stabilityScore: number;
  penalties: number;
  finalScore: number;
};

export function calculateFundamentalBreakdown(
  f: FundamentalInputs,
): FundamentalBreakdown {
  const q = qualityScore(f);
  const g = growthScore(f);
  const v = valuationScore(f);
  const s = stabilityScore(f);
  const p = penalties(f);
  return {
    qualityScore: q,
    growthScore: g,
    valuationScore: v,
    stabilityScore: s,
    penalties: p,
    finalScore: Math.max(0, Math.min(100, q + g + v + s - p)),
  };
}

/** Port of stock-service BaseFundamentalScoring (simplified, no sector table). */
export function calculateFundamentalScore(f: FundamentalInputs): number {
  return calculateFundamentalBreakdown(f).finalScore;
}

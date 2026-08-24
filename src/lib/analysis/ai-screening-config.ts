/**
 * AI Screening Rule — Level 2 config types/constants.
 *
 * Split out from ai-screening.ts (which pulls in Prisma/fs-backed data
 * modules) so client components can import weight/threshold shapes without
 * dragging server-only code into the browser bundle.
 */

export type ScreeningWeights = {
  roe: number;
  revenueCagr: number;
  epsGrowth3y: number;
  debtToEquity: number;
  fcf: number;
  peg: number;
};

export const DEFAULT_SCREENING_WEIGHTS: ScreeningWeights = {
  roe: 0.25,
  revenueCagr: 0.2,
  epsGrowth3y: 0.2,
  debtToEquity: 0.15,
  fcf: 0.1,
  peg: 0.1,
};

export type HardFilterThresholds = {
  minRoe: number;
  maxDebtToEquity: number;
  minLiquidityVnd: number;
};

export const DEFAULT_HARD_FILTER_THRESHOLDS: HardFilterThresholds = {
  minRoe: 15,
  maxDebtToEquity: 2.0,
  minLiquidityVnd: 1_000_000_000, // ~1B VND/day proxy (price × 20d avg volume)
};

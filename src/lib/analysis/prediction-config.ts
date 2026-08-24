/** Pure constants for the AI Prediction module — client-safe, zero imports (see ai-screening-pattern.mdc §1). */

export const PREDICTION_HORIZONS = [7, 14, 30, 60, 90] as const;
export type PredictionHorizonDays = (typeof PREDICTION_HORIZONS)[number];
export const DEFAULT_HORIZON_DAYS: PredictionHorizonDays = 30;

export const PREDICTION_DISCLAIMER =
  "This is a probabilistic estimate derived from historical price volatility, trend, and current technical/fundamental scores — not a guaranteed price target. Past patterns may not repeat, and this must not be used as a standalone buy/sell signal.";

import { getPriceHistory } from "@/lib/market-service";
import { analyzeCombinedRow } from "@/lib/analysis/combined-analysis";
import { PREDICTION_DISCLAIMER, DEFAULT_HORIZON_DAYS } from "@/lib/analysis/prediction-config";

/**
 * AI Prediction — Level 4 ("Probability, Not Certainty").
 *
 * No trained ML model runs here: this app has no Python training pipeline,
 * feature store, or multi-year price history to fit/serve XGBoost/LSTM/etc.
 * in-process. Instead this is a statistical random-walk model — historical
 * daily log-returns give a drift/volatility estimate, scaled to the horizon,
 * then nudged by the existing Technical+Fundamental Combined score (Level 2
 * output, reused via `analyzeCombinedRow` — never recomputed here). The
 * spec's hard constraints are enforced structurally:
 * - No absolute price target is ever computed, only probabilities/percentages.
 * - `disclaimer` + `confidence_note` are attached to every result.
 * - `backtest` is always populated (or explicitly marked insufficient) — this
 *   module never ships a bare prediction with no visible track record.
 * - `model_used` honestly says "statistical", never a model family that isn't
 *   actually running (see AI_PREDICTION_RULES in scoring-rules.ts).
 */

const HISTORY_DAYS = 260; // ~1 trading year — the most this app's price-history endpoints reliably return for VN tickers
const MIN_HISTORY_POINTS = 40;
const BACKTEST_LOOKBACK = 60;
const MIN_LOOKBACK = 20; // floor for a shrunk lookback on genuinely short histories (e.g. recent IPOs) — below this the mu/sigma estimate is too noisy to bother
const MIN_BACKTEST_SAMPLES = 20;
const MIN_SEQUENTIAL_TRADES = 4;
const MAX_ANNUALIZED_TILT_PCT = 8; // cap on how far the Level 2 combined score can shift annualized drift, in percentage points
const TRADING_DAYS_PER_YEAR = 252;
const Z_90 = 1.645;

export const MODEL_USED =
  "Statistical: historical volatility & drift (random-walk), technical+fundamental score tilt — not a trained ML model (see Scoring Rules tab)";

export type BacktestStats = {
  windowSampleCount: number;
  hitRatePct: number | null;
  calibration: {
    predictedUpCount: number;
    meanPredictedProbUpPct: number | null;
    actualUpRatePct: number | null;
  } | null;
  sequentialTradeCount: number;
  sharpeRatio: number | null;
  maxDrawdownPct: number | null;
  insufficientSample: boolean;
  note: string;
};

export type PricePrediction = {
  ticker: string;
  horizon_days: number;
  prob_price_up: number | null;
  expected_return_pct: number | null;
  expected_return_range_90pct_ci: [number, number] | null;
  risk_volatility_pct: number | null;
  model_used: string;
  confidence_note: string;
  disclaimer: string;
  data_window_days: number;
  generated_at: string;
  tilt: {
    combined_score: number | null;
    applied_tilt_pct: number;
  };
  backtest: BacktestStats;
  insufficient_data: boolean;
};

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Abramowitz-Stegun erf approximation (max error ~1.5e-7) — no erf in Math. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function logReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  return rets;
}

function emptyBacktest(note: string): BacktestStats {
  return {
    windowSampleCount: 0,
    hitRatePct: null,
    calibration: null,
    sequentialTradeCount: 0,
    sharpeRatio: null,
    maxDrawdownPct: null,
    insufficientSample: true,
    note,
  };
}

type BacktestSample = { predictedProbUp: number; actualUp: boolean; tradeLogReturn: number };

/** One walk-forward step: build mu/sigma from `lookback` returns strictly before `t`, predict, compare to the actual forward return. */
function walkForwardStep(rets: number[], closes: number[], t: number, horizonDays: number, lookback: number): BacktestSample | null {
  const window = rets.slice(t - lookback, t);
  if (window.length < lookback) return null;
  const mu = mean(window);
  const sigma = stdev(window);
  if (sigma <= 0) return null;
  const muH = mu * horizonDays;
  const sigmaH = sigma * Math.sqrt(horizonDays);
  const predictedProbUp = normalCdf(muH / sigmaH);
  const actualLogReturn = Math.log(closes[t + horizonDays] / closes[t]);
  const position = predictedProbUp > 0.5 ? 1 : predictedProbUp < 0.5 ? -1 : 0;
  return { predictedProbUp, actualUp: actualLogReturn > 0, tradeLogReturn: position * actualLogReturn };
}

function runBacktest(closes: number[], horizonDays: number): BacktestStats {
  // Prefer the full BACKTEST_LOOKBACK, but shrink it (down to MIN_LOOKBACK)
  // rather than flatly refusing when history is short (e.g. a recent IPO) —
  // a noisier mu/sigma estimate, clearly disclosed, beats no backtest at all.
  const lookback = Math.min(BACKTEST_LOOKBACK, closes.length - horizonDays - 1);
  if (lookback < MIN_LOOKBACK) {
    return emptyBacktest(
      `Not enough history (${closes.length} days) to backtest a ${horizonDays}-day horizon — need at least ${MIN_LOOKBACK + horizonDays + 1} days.`,
    );
  }
  const rets = logReturns(closes);

  // Overlapping windows (step = 1 day) — maximizes sample size for hit-rate
  // and calibration, at the cost of the windows not being independent.
  const overlapping: BacktestSample[] = [];
  for (let t = lookback; t + horizonDays < closes.length; t++) {
    const s = walkForwardStep(rets, closes, t, horizonDays, lookback);
    if (s) overlapping.push(s);
  }

  if (overlapping.length === 0) {
    return emptyBacktest("No valid backtest windows (flat/zero-volatility history).");
  }

  const hits = overlapping.filter((s) => s.predictedProbUp > 0.5 === s.actualUp).length;
  const hitRatePct = Math.round((hits / overlapping.length) * 1000) / 10;

  const predictedUp = overlapping.filter((s) => s.predictedProbUp > 0.5);
  const calibration = predictedUp.length
    ? {
        predictedUpCount: predictedUp.length,
        meanPredictedProbUpPct: Math.round(mean(predictedUp.map((s) => s.predictedProbUp)) * 1000) / 10,
        actualUpRatePct: Math.round((predictedUp.filter((s) => s.actualUp).length / predictedUp.length) * 1000) / 10,
      }
    : null;

  // Non-overlapping windows (step = horizonDays) — a valid back-to-back
  // equity curve for Sharpe/max-drawdown. Overlapping trades can't be
  // chained into one curve without double-counting the same days.
  const sequential: BacktestSample[] = [];
  for (let t = lookback; t + horizonDays < closes.length; t += horizonDays) {
    const s = walkForwardStep(rets, closes, t, horizonDays, lookback);
    if (s) sequential.push(s);
  }

  let sharpeRatio: number | null = null;
  let maxDrawdownPct: number | null = null;
  if (sequential.length >= MIN_SEQUENTIAL_TRADES) {
    const tradeReturns = sequential.map((s) => s.tradeLogReturn);
    const m = mean(tradeReturns);
    const sd = stdev(tradeReturns);
    const periodsPerYear = TRADING_DAYS_PER_YEAR / horizonDays;
    sharpeRatio = sd > 0 ? Math.round((m / sd) * Math.sqrt(periodsPerYear) * 100) / 100 : null;

    let cum = 0;
    let peak = 0;
    let maxDd = 0;
    for (const r of tradeReturns) {
      cum += r;
      peak = Math.max(peak, cum);
      maxDd = Math.max(maxDd, peak - cum);
    }
    maxDrawdownPct = Math.round((1 - Math.exp(-maxDd)) * 1000) / 10;
  }

  const insufficientSample = overlapping.length < MIN_BACKTEST_SAMPLES;

  return {
    windowSampleCount: overlapping.length,
    hitRatePct,
    calibration,
    sequentialTradeCount: sequential.length,
    sharpeRatio,
    maxDrawdownPct,
    insufficientSample,
    note:
      `Hit-rate/calibration use ${overlapping.length} overlapping ${horizonDays}-day windows (not independent — a disclosed caveat, not a hidden one). ` +
      `Sharpe/max-drawdown use ${sequential.length} non-overlapping back-to-back windows for a valid equity curve` +
      `${sequential.length < MIN_SEQUENTIAL_TRADES ? " — too few for a reliable read at this horizon" : ""}.` +
      `${lookback < BACKTEST_LOOKBACK ? ` Lookback window shrunk to ${lookback} days (from the usual ${BACKTEST_LOOKBACK}) due to limited price history — mu/sigma estimates are noisier than usual.` : ""}`,
  };
}

export async function buildPricePrediction(
  symbol: string,
  opts?: { horizonDays?: number; combinedScore?: number | null },
): Promise<PricePrediction> {
  const ticker = symbol.toUpperCase();
  const horizonDays = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const generatedAt = new Date().toISOString();

  const history = await getPriceHistory(ticker, HISTORY_DAYS);
  const closes = history.map((p) => p.close).filter((c) => c > 0);

  if (closes.length < MIN_HISTORY_POINTS) {
    return {
      ticker,
      horizon_days: horizonDays,
      prob_price_up: null,
      expected_return_pct: null,
      expected_return_range_90pct_ci: null,
      risk_volatility_pct: null,
      model_used: MODEL_USED,
      confidence_note: `Only ${closes.length} days of price history available (need ${MIN_HISTORY_POINTS}+) — not enough to estimate volatility/drift reliably.`,
      disclaimer: PREDICTION_DISCLAIMER,
      data_window_days: closes.length,
      generated_at: generatedAt,
      tilt: { combined_score: null, applied_tilt_pct: 0 },
      backtest: emptyBacktest("Insufficient price history to backtest."),
      insufficient_data: true,
    };
  }

  const combinedScore = opts?.combinedScore ?? (await analyzeCombinedRow({ symbol: ticker })).combinedScore;

  const rets = logReturns(closes);
  const muDaily = mean(rets);
  const sigmaDaily = stdev(rets);

  const tiltFraction = Math.max(-1, Math.min(1, (combinedScore - 50) / 50));
  const appliedTiltAnnualizedPct = tiltFraction * MAX_ANNUALIZED_TILT_PCT;
  const tiltDaily = appliedTiltAnnualizedPct / 100 / TRADING_DAYS_PER_YEAR;

  const muHorizon = (muDaily + tiltDaily) * horizonDays;
  const sigmaHorizon = sigmaDaily * Math.sqrt(horizonDays);

  const probUp =
    sigmaHorizon > 0 ? normalCdf(muHorizon / sigmaHorizon) : muHorizon > 0 ? 1 : muHorizon < 0 ? 0 : 0.5;
  const expectedReturnPct = (Math.exp(muHorizon) - 1) * 100;
  const ciLower = (Math.exp(muHorizon - Z_90 * sigmaHorizon) - 1) * 100;
  const ciUpper = (Math.exp(muHorizon + Z_90 * sigmaHorizon) - 1) * 100;
  const annualizedVolPct = sigmaDaily * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

  const backtest = runBacktest(closes, horizonDays);

  const confidenceNote =
    `Computed live from ${closes.length} trading days of price history (through ${history[history.length - 1]?.date ?? "n/a"}) — ` +
    `not a periodically retrained model, so there is no fixed "last retrain date"; every request recomputes from current data. ` +
    `Backtest: ${backtest.hitRatePct != null ? `${backtest.hitRatePct}% directional hit rate` : "insufficient data"} over ${backtest.windowSampleCount} historical ${horizonDays}-day windows.`;

  return {
    ticker,
    horizon_days: horizonDays,
    prob_price_up: Math.round(probUp * 1000) / 1000,
    expected_return_pct: Math.round(expectedReturnPct * 10) / 10,
    expected_return_range_90pct_ci: [Math.round(ciLower * 10) / 10, Math.round(ciUpper * 10) / 10],
    risk_volatility_pct: Math.round(annualizedVolPct * 10) / 10,
    model_used: MODEL_USED,
    confidence_note: confidenceNote,
    disclaimer: PREDICTION_DISCLAIMER,
    data_window_days: closes.length,
    generated_at: generatedAt,
    tilt: {
      combined_score: combinedScore,
      applied_tilt_pct: Math.round(appliedTiltAnnualizedPct * 10) / 10,
    },
    backtest,
    insufficient_data: false,
  };
}

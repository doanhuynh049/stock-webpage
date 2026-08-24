/** Human-readable scoring rules — mirrors stock-service BaseFundamentalScoring / BaseTechnicalAnalysis. */

export const FUNDAMENTAL_RULES = {
  title: "Fundamental score (0–100)",
  categories: [
    {
      name: "Quality (max 40)",
      rules: [
        "ROE ≥ 20% → 20 pts; 15–20% → 16–20; 10–15% → 8–16",
        "ROA ≥ 10% → 10 pts; 7–10% → 7–10; 5–7% → 4–7",
        "Net/gross margin ≥ 20% → 10 pts; 10–20% → 6–10; 5–10% → 3–6",
      ],
    },
    {
      name: "Growth (max 30)",
      rules: [
        "Revenue growth ≥ 20% → 12 pts; 10–20% → 8–12; 0–10% → 4–8",
        "Profit growth ≥ 15% → 10 pts; 5–15% → 5–10",
        "EPS growth ≥ 15% → 8 pts; 5–15% → 4–8",
      ],
    },
    {
      name: "Valuation (max 20)",
      rules: [
        "P/E ≤ 12 → +6; 12–18 → +3–6; 18–30 → 0–3; > 30 → penalty",
        "P/B ≤ 2 → +4; 2–4 → +1–4; > 4 → penalty",
        "Base score starts at 10 before P/E and P/B adjustments",
      ],
    },
    {
      name: "Stability (max 10)",
      rules: [
        "Debt/equity < 0.5 → 10 pts; 0.5–0.7 → 6–8; 0.7–1.0 → 3–6; ≥ 1.0 → 0",
      ],
    },
    {
      name: "Penalties (max −50)",
      rules: [
        "Profit growth < −10% → −15",
        "Debt/equity > 1.5 → −10",
        "P/E > 40 → −8",
      ],
    },
  ],
  formula: "Final = Quality + Growth + Valuation + Stability − Penalties (clamped 0–100)",
  dataSources: [
    "Primary: fundamental_snapshot in Neon (or data/neon-cache/fundamental-snapshots.json)",
    "Fallback: seed market data (P/E, P/B, ROE, revenue growth)",
  ],
} as const;

export const TECHNICAL_RULES = {
  title: "Technical score (0–100)",
  formula: "Starts at 50 (neutral). Adjustments from technical_snapshot + current price. Clamped 0–100.",
  categories: [
    {
      name: "Trend — moving averages (SMA20 / SMA50)",
      rules: [
        "Price > SMA20 > SMA50 (uptrend) → +25",
        "Price > SMA20 and SMA20 ≈ SMA50 (within 0.5%) → +15",
        "Price < SMA20 < SMA50 (downtrend) → −25",
        "Price < SMA20 and SMA20 ≈ below SMA50 (within 0.5%) → −15",
        "Price > 15% above SMA20 (extended) → −10",
      ],
    },
    {
      name: "Support / resistance",
      rules: [
        "Price in lower 30% of support–resistance range → +15 (near support)",
        "Price in upper 70% of range → −15 (near resistance)",
        "Price breaks below support by > 2% → −25",
      ],
    },
    {
      name: "Volume vs volume MA",
      rules: [
        "Volume ≥ 1.5× volume MA → +20 (strong confirmation)",
        "Volume < 0.8× volume MA → −10 (weak participation)",
        "Volume < 0.25× volume MA → additional −5",
      ],
    },
    {
      name: "RSI",
      rules: [
        "RSI 45–60 (healthy zone) → +5",
        "RSI > 70 (overbought) → −10",
        "RSI > 75 → additional −15",
        "RSI > 70 with volume < volume MA → −20 (weak overbought rally)",
      ],
    },
    {
      name: "MACD",
      rules: [
        "MACD > signal line (bullish) → +10",
        "MACD < signal line (bearish) → −10",
      ],
    },
  ],
  ratings: [
    "≥ 75 → Excellent",
    "60–74 → Good",
    "45–59 → Fair",
    "< 45 → Poor",
  ],
  dataSources: [
    "Primary: technical_snapshot in Neon (RSI, SMA, MACD, support/resistance, volume)",
    "Or data/neon-cache/technical-snapshots.json when DB_CACHE_FIRST=1",
    "No snapshot → score stays 50; trend/momentum labels show N/A",
  ],
} as const;

export const COMBINED_RULES = {
  title: "Combined score & signals",
  formula: "Combined = round(0.60 × Technical + 0.40 × Fundamental)",
  note: "Recommendation uses combined + technical + fundamental scores plus support/resistance context (not score bands alone).",
  signals: [
    "ACCUMULATE — combined ≥ 65, technical ≥ 55, fundamental ≥ 60, favorable risk/reward near support",
    "WATCH — strong scores but near resistance or risk/reward < 1.5",
    "HOLD — combined ≥ 50, technical ≥ 45, fundamental ≥ 55, not near resistance",
    "TRIM — near resistance with RSI overbought",
    "AVOID — combined < 50 or technical < 45",
    "SELL — support broken, or below MA50 + overbought RSI, or combined < 35 (unless risk/reward ≥ 2 at support)",
  ],
} as const;

export const AI_SCREENING_RULES = {
  title: "AI Screening — Level 2 (~500 stock universe → top ~20 shortlist)",
  note: "Universe is capped at VN100 (~73 symbols with tracked snapshots) — no broader ~500-symbol feed exists in this app today.",
  steps: [
    "Step 1 — Hard filter (rule-based): reject ROE < 15%, Debt/Equity > 2.0, or liquidity (price × 20d avg volume) below threshold. FCF 2-year-negative check cannot run — FCF history isn't stored, so it's always marked \"data unavailable\", never used to reject.",
    "Step 2 — Weighted score (rule-based): each metric min-max normalized 0–100 across the surviving set, then combined as 0.25×ROE + 0.20×RevenueGrowth + 0.20×EPSGrowth + 0.15×(inverse Debt/Equity) + 0.10×FCF(neutral 50) + 0.10×(inverse PEG). Weights are user-configurable and re-normalized to sum to 100%. Top ~20 by score kept.",
    "Step 3 — AI explanation (LLM): given only the Step 2 numbers, the model writes a ≤15-word reason citing an actual metric value plus optional qualitative flags. It never receives or returns a score — ai_score/sub_scores are always the Step 2 output, copied through unchanged. A reason that doesn't cite a number is discarded for a deterministic rule-based one.",
  ],
  dataProxies: [
    "\"Revenue CAGR\" → YoY revenueGrowth (no multi-year revenue series stored)",
    "\"EPS growth 3y\" → YoY epsGrowth (same reason)",
    "\"Liquidity\" → currentPrice × volumeMa (avg daily trading value isn't stored directly)",
    "\"FCF\" → not stored at all; always neutral score + \"data unavailable\" flag",
  ],
} as const;

export const AI_NEWS_SENTIMENT_RULES = {
  title: "AI News Reading & Sentiment Analysis (per ticker)",
  note: "AI's edge here is reading volume, not predicting price — sentiment is a lens on public tone, never a buy/sell signal. The disclaimer is attached to every report object, not just shown once in the UI.",
  steps: [
    "Ingestion: reuses the existing news pipeline (Yahoo + Google News RSS + CafeF + VnExpress) — no direct Reuters/Bloomberg/SEC EDGAR API (paid, or not applicable: VN-listed companies don't file with EDGAR). \"Tier-1 global\" trust is inferred from Google News' publisher attribution when it surfaces a Reuters/Bloomberg/AP/Nikkei-sourced article; \"VN official\" = CafeF/VnExpress.",
    "News classification (LLM + rule-based fallback): each article → category (partnership/earnings/regulatory/management/macro/analyst_rating/other), sentiment, time_horizon, confidence, reasoning. headline/source/timestamp/link are always copied from the real fetched article — the model is never asked for them, so it structurally cannot fabricate a source.",
    "Social sentiment (Stocktwits only — free, public, no key; Reddit's public endpoints are unreliable server-side, X's search API has no free tier): bullish/bearish % always paired with sample size; bot/spam filtered by duplicate-text, per-user post cap, and newborn-account heuristics; buzz change is an approximation vs. retrievable history, not a true 7-day baseline (disclosed in `methodology_note`), and is reported neutrally — no direction assumed from volume alone.",
    "Aggregation: conflicts between news tone and social tone are surfaced as an explicit `conflicts[]` list, never averaged into one number. Tier-1/VN-official news outweighs social sentiment in the summary's trust-weighting, but no single blended directional score is ever computed.",
  ],
  dataRealities: [
    "Stocktwits has no Vietnamese-exchange listings — VN ticker strings frequently collide with unrelated US-listed securities (confirmed live: \"FPT\" resolved to a US municipal bond fund, \"MWG\" to an unrelated \"Multi Ways Holdings Ltd\", \"VNM\" to a Vietnam ETF, none the actual VN company). A region-match guard rejects any non-VN-region resolution rather than misattribute — in practice this means social sentiment is \"unavailable\" for almost every real VN ticker, which is the honest result of Stocktwits not covering this market.",
    "Buzz-change % is capped by what the public Stocktwits endpoint actually returns (recent messages only) — not a genuine trailing 7-day average.",
    "Refreshes every ~2h (client cache) — news/sentiment moves over hours, unlike Level 2's quarterly-fundamentals cadence.",
    "Portfolio Overview runs the full LLM pipeline per holding, capped at the top 10 by weight (explicit user decision — costlier than AI Analyst/AI Screening's 1-call-total design); holdings beyond the cap are listed, not silently dropped.",
  ],
} as const;

export const AI_PREDICTION_RULES = {
  title: "AI Prediction — Level 4 (Probability, Not Certainty)",
  note: "No trained ML model (XGBoost/LightGBM/LSTM/etc.) runs here — this app has no Python training pipeline, feature store, or multi-year price history to train/serve one. Every number is a statistical estimate computed live from data already in this app, never a guaranteed price target.",
  steps: [
    "Statistical model: daily log-returns over the trailing ~1 year of price history give a drift (mean) and volatility (std dev), scaled to the chosen horizon under a random-walk assumption. Probability of a positive return = the normal CDF of (drift ÷ volatility) at that horizon.",
    "Technical + Fundamental tilt (Level 2 reuse): the existing Combined score (0.60×Technical + 0.40×Fundamental, from combined-analysis.ts — never recomputed here) nudges the drift by up to ±8 percentage points annualized. A neutral score of 50 applies zero tilt.",
    "Sentiment (Level 3) tilt is NOT wired in yet — doing so would mean triggering the LLM-backed News Sentiment pipeline on every prediction, which this module deliberately avoids to stay LLM-free and fast. A documented gap, not a silent one.",
    "Backtest: walk-forward only, never shuffled/randomized — every historical window uses only returns from before its own prediction point. Hit-rate and calibration (of the windows predicted \"up\", how many actually went up) use overlapping windows for sample size; Sharpe ratio and max drawdown use a separate non-overlapping sequence so the equity curve is valid — overlapping trades can't be chained without double-counting the same days.",
  ],
  dataRealities: [
    "\"model_used\" honestly says \"statistical\", never XGBoost/LightGBM/LSTM — claiming a model family that isn't actually running would be a false claim, not a rounding error.",
    "No fixed retrain schedule — every request recomputes from current data instead of loading a periodically retrained model; `confidence_note` discloses this explicitly rather than inventing a fake retrain date.",
    "History is capped at ~260 trading days (this app's price-history endpoints don't reliably return more for VN tickers) — backtest sample sizes are disclosed per request, and predictions with under 40 days of history are marked insufficient rather than estimated from too little data.",
    "Portfolio Overview runs this for every holding, not capped at 10 like AI News — there's no LLM call to bound. `MAX_PREDICTION_HOLDINGS` (50) is a serverless-timeout safety valve only, not a cost cap.",
  ],
} as const;

export const INDEX_RULES = {
  vn30: "All 30 symbols from data/vn30-stock-info.json (HOSE blue-chip index). Ranked by score.",
  vn100: "All symbols from data/vn100-stock-info.json. Top 30 shown by default (same as stock-service top-30 screen).",
  portfolio: "Your portfolio_holding symbols — fundamental breakdown per holding you own.",
  sector:
    "9 sector leaders from data/sector-stocks.json — combined scores + trend leaders.",
} as const;

export type TechnicalIndicators = {
  rsi?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  volume?: number | null;
  volumeMa?: number | null;
};

function macdBullish(tech: TechnicalIndicators): boolean {
  return (
    tech.macd != null &&
    tech.macdSignal != null &&
    tech.macd > tech.macdSignal
  );
}

/** Port of stock-service BaseTechnicalAnalysis.calculateTechnicalScore */
export function calculateTechnicalScore(
  tech: TechnicalIndicators | null,
  currentPrice: number,
): number {
  if (!tech) return 50;

  let score = 50;

  if (tech.sma20 != null && tech.sma50 != null) {
    if (currentPrice > tech.sma20 && tech.sma20 > tech.sma50) {
      score += 25;
    } else if (
      currentPrice > tech.sma20 &&
      tech.sma20 >= tech.sma50 * 0.995
    ) {
      score += 15;
    } else if (currentPrice < tech.sma20 && tech.sma20 < tech.sma50) {
      score -= 25;
    } else if (
      currentPrice < tech.sma20 &&
      tech.sma20 < tech.sma50 * 1.005
    ) {
      score -= 15;
    }
    if (currentPrice > tech.sma20 * 1.15) score -= 10;
  }

  if (tech.supportLevel != null && tech.resistanceLevel != null) {
    const range = tech.resistanceLevel - tech.supportLevel;
    if (range > 0) {
      const position = (currentPrice - tech.supportLevel) / range;
      if (position < 0.3) score += 15;
      else if (position > 0.7) score -= 15;
    }
  }

  if (tech.volume != null && tech.volumeMa != null && tech.volumeMa > 0) {
    const volumeRatio = tech.volume / tech.volumeMa;
    if (volumeRatio >= 1.5) score += 20;
    else if (volumeRatio < 0.8) score -= 10;
    if (volumeRatio < 0.25) score -= 5;
  }

  if (tech.rsi != null) {
    if (tech.rsi >= 45 && tech.rsi <= 60) score += 5;
    else if (tech.rsi > 70) score -= 10;
  }

  if (macdBullish(tech)) score += 10;
  else if (
    tech.macd != null &&
    tech.macdSignal != null &&
    tech.macd < tech.macdSignal
  ) {
    score -= 10;
  }

  if (tech.rsi != null && tech.rsi > 75) score -= 15;

  if (
    tech.rsi != null &&
    tech.rsi > 70 &&
    tech.volume != null &&
    tech.volumeMa != null &&
    tech.volumeMa > 0
  ) {
    const volumeRatio = tech.volume / tech.volumeMa;
    if (volumeRatio < 1.0) score -= 20;
  }

  if (
    tech.supportLevel != null &&
    currentPrice < tech.supportLevel * 0.98
  ) {
    score -= 25;
  }

  return Math.max(0, Math.min(100, score));
}

export function combinedScore(
  technicalScore: number,
  fundamentalScore: number,
  techWeight = 0.6,
  fundWeight = 0.4,
): number {
  const sum = techWeight + fundWeight;
  const wT = sum > 0 ? techWeight / sum : 0.6;
  const wF = sum > 0 ? fundWeight / sum : 0.4;
  return Math.round(technicalScore * wT + fundamentalScore * wF);
}

/** Port of stock-service 6-category recommendation (core rules). */
export function getRecommendationFromScore(
  combined: number,
  technical: number,
  fundamental: number,
  tech: TechnicalIndicators | null,
  currentPrice: number,
): string {
  const effectiveFundamental = fundamental;

  let positionPercent = 0.5;
  let hasLocation = false;
  if (
    tech?.supportLevel != null &&
    tech?.resistanceLevel != null &&
    tech.resistanceLevel > tech.supportLevel
  ) {
    positionPercent =
      (currentPrice - tech.supportLevel) /
      (tech.resistanceLevel - tech.supportLevel);
    hasLocation = true;
  }

  let riskRewardRatio = 0;
  if (tech?.supportLevel != null && tech?.resistanceLevel != null) {
    const stopLoss = tech.supportLevel * 0.96;
    const targetPrice =
      positionPercent > 0.8
        ? tech.resistanceLevel * 1.1
        : tech.resistanceLevel * 0.98;
    if (stopLoss < currentPrice && targetPrice > currentPrice) {
      const risk = currentPrice - stopLoss;
      const reward = targetPrice - currentPrice;
      if (risk > 0) riskRewardRatio = reward / risk;
    }
  }

  const supportBroken =
    tech?.supportLevel != null && currentPrice < tech.supportLevel * 0.98;

  let nearSupport = false;
  if (tech?.supportLevel != null) {
    const distPct =
      ((currentPrice - tech.supportLevel) / tech.supportLevel) * 100;
    const locNear = hasLocation && positionPercent >= 0 && positionPercent < 0.3;
    const absNear = distPct >= 0 && distPct <= 1.5;
    nearSupport = (locNear || absNear) && !supportBroken;
  }

  const nearResistance = hasLocation && positionPercent > 0.75;
  const belowMa50 =
    tech?.sma50 != null ? currentPrice < tech.sma50 : false;
  const rsiOverbought = tech?.rsi != null ? tech.rsi > 70 : false;

  const sellForbidden =
    riskRewardRatio >= 2 && nearSupport && !supportBroken;

  if (combined >= 65 && technical >= 55 && effectiveFundamental >= 60) {
    if (nearSupport && riskRewardRatio >= 1.5 && !nearResistance)
      return "ACCUMULATE";
    if (nearResistance || riskRewardRatio < 1.5) return "WATCH";
    if (positionPercent >= 0.3 && positionPercent <= 0.6) return "ACCUMULATE";
    return "WATCH";
  }

  if (
    combined >= 50 &&
    technical >= 45 &&
    effectiveFundamental >= 55 &&
    !nearResistance
  ) {
    return "HOLD";
  }

  if (
    (combined < 40 || effectiveFundamental < 40 || supportBroken) &&
    !sellForbidden
  ) {
    if (supportBroken || (belowMa50 && rsiOverbought)) return "SELL";
    if (combined < 35) return "SELL";
  }

  if (combined < 50 || technical < 45) return "AVOID";
  if (nearResistance && rsiOverbought) return "TRIM";

  return "HOLD";
}

export function scoreRating(score: number): string {
  if (score >= 75) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 45) return "Fair";
  return "Poor";
}

import type { FundamentalInputs } from "@/lib/analysis/fundamental-scoring";
import {
  calculateFundamentalBreakdown,
  type FundamentalBreakdown,
} from "@/lib/analysis/fundamental-scoring";

function bankingQuality(f: FundamentalInputs): number {
  let score = 0;
  const roe = f.roe != null ? f.roe / 100 : null;
  if (roe != null) {
    if (roe >= 0.2) score += 20;
    else if (roe >= 0.15) score += 16;
    else if (roe >= 0.1) score += 8;
  }
  const roa = f.roa != null ? f.roa / 100 : null;
  if (roa != null) {
    if (roa >= 0.02) score += 10;
    else if (roa >= 0.015) score += 8;
    else if (roa >= 0.01) score += 5;
    else if (roa >= 0.005) score += 2;
  }
  const margin = f.netProfitMargin ?? f.grossProfitMargin;
  if (margin != null) {
    const m = margin > 1 ? margin / 100 : margin;
    if (m >= 0.035) score += 10;
    else if (m >= 0.025) score += 6;
    else if (m >= 0.015) score += 3;
  }
  return Math.min(40, score);
}

function realEstateStability(f: FundamentalInputs): number {
  if (f.debtToEquity == null) return 5;
  const de = f.debtToEquity;
  if (de <= 1.0) return 10;
  if (de <= 1.5) return 8;
  if (de <= 2.0) return 5;
  return 0;
}

function bankingStability(): number {
  return 10;
}

/** Sector-aware fundamental scoring (port of stock-service SectorAwareFundamentalScoring). */
export function calculateSectorFundamentalBreakdown(
  f: FundamentalInputs,
  sector?: string | null,
): FundamentalBreakdown {
  const base = calculateFundamentalBreakdown(f);
  const s = (sector ?? "").toLowerCase();

  if (s === "banking") {
    const q = bankingQuality(f);
    const st = bankingStability();
    const finalScore = Math.max(
      0,
      Math.min(100, q + base.growthScore + base.valuationScore + st - base.penalties),
    );
    return {
      ...base,
      qualityScore: q,
      stabilityScore: st,
      finalScore,
    };
  }

  if (s === "real estate" || s === "construction") {
    const st = realEstateStability(f);
    const finalScore = Math.max(
      0,
      Math.min(
        100,
        base.qualityScore + base.growthScore + base.valuationScore + st - base.penalties,
      ),
    );
    return { ...base, stabilityScore: st, finalScore };
  }

  return base;
}

export function calculateSectorFundamentalScore(
  f: FundamentalInputs,
  sector?: string | null,
): number {
  return calculateSectorFundamentalBreakdown(f, sector).finalScore;
}

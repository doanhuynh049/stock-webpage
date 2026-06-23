"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  XCircle,
  Lightbulb,
  Clock,
  Target,
  Scale,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import type { CombinedAnalysisRow } from "@/lib/analysis/combined-analysis";
import type { SectorAnalysisResult, SectorRollup } from "@/lib/analysis/sector-analysis";

// ─── types ────────────────────────────────────────────────────────────────────

type ThesisAnswer = "yes" | "no" | "uncertain" | null;
type AutoStatus = "pass" | "warn" | "fail" | "unknown";

interface AutoCheck {
  status: AutoStatus;
  label: string;
  reason: string;
  bullets?: string[];
}

// Decline sub-types (more granular than A/B/C)
type DeclineSubType = "A1" | "A2" | "A3" | "B" | "C" | "unknown";

interface DeclineCheck {
  type: DeclineSubType;
  label: string;
  danger: "low" | "medium" | "high" | "critical";
  score: number; // direct contribution to total /12
  reason: string;
  detail: string;
  isHardStop: boolean;
}

// 3-part valuation
interface ValuationCheck {
  historical: AutoStatus; // cheap vs own past (valuationScore proxy)
  peer: AutoStatus;       // cheap vs sector P/E average
  growthAdj: AutoStatus;  // growth-adjusted (implicit PEG)
  partsPass: number;      // 0–3
  overallStatus: AutoStatus;
  label: string;
  reason: string;
  bullets: string[];
  peerAvgPE: number | null;
}

// Earnings momentum (gate)
type EarningsTrend = "accelerating" | "stable" | "decelerating" | "declining";

interface EarningsTrendCheck {
  trend: EarningsTrend;
  status: AutoStatus;
  label: string;
  reason: string;
  isGate: boolean; // if true and declining → hard stop + score cap
}

// ─── auto-analysis: fundamentals ─────────────────────────────────────────────

function analyzeFundamentals(fundRow: FundamentalAnalysisRow | undefined): AutoCheck {
  if (!fundRow) {
    return { status: "unknown", label: "No snapshot", reason: "No fundamental snapshot for this stock. Review manually." };
  }
  const { finalScore, qualityScore, stabilityScore } = fundRow.breakdown;
  const roe = fundRow.roe;
  const issues: string[] = [];
  const positives: string[] = [];

  if (finalScore >= 65) positives.push(`F-Score ${finalScore}/100 — strong`);
  else if (finalScore >= 50) positives.push(`F-Score ${finalScore}/100 — adequate`);
  else issues.push(`F-Score ${finalScore}/100 — weak (min 50)`);

  if (roe != null) {
    if (roe >= 18) positives.push(`ROE ${roe.toFixed(1)}% — excellent`);
    else if (roe >= 12) positives.push(`ROE ${roe.toFixed(1)}% — adequate`);
    else issues.push(`ROE ${roe.toFixed(1)}% — below 12% minimum`);
  }
  if (qualityScore < 12) issues.push(`Low quality score (${qualityScore}/25)`);
  if (stabilityScore < 10) issues.push(`Balance sheet concern (stability ${stabilityScore}/25)`);

  const hasCritical = finalScore < 45 || (roe != null && roe < 8);
  if (hasCritical || issues.length >= 3) {
    return { status: "fail", label: "Deteriorating", reason: "Multiple fundamental weaknesses — price decline may reflect earnings decline.", bullets: issues.slice(0, 3) };
  }
  if (issues.length >= 1 || finalScore < 58) {
    return { status: "warn", label: "Mixed signals", reason: "Fundamentals acceptable but not compelling. Monitor closely.", bullets: [...positives.slice(0, 2), ...issues] };
  }
  return { status: "pass", label: "Healthy", reason: "Revenue, profit, and quality ratios show no major red flags.", bullets: positives.slice(0, 3) };
}

// ─── auto-analysis: earnings trend (gate) ────────────────────────────────────

function analyzeEarningsTrend(fundRow: FundamentalAnalysisRow | undefined): EarningsTrendCheck {
  if (!fundRow) {
    return { trend: "stable", status: "unknown", label: "No data", reason: "Cannot determine earnings trend — no snapshot data.", isGate: false };
  }
  const { growthScore, qualityScore } = fundRow.breakdown;
  const roe = fundRow.roe;

  // Detect "value trap": high ROE + very low growth = peaked earnings
  const valueTrapRisk = (roe ?? 0) > 15 && growthScore < 10;

  if (growthScore < 7 || (valueTrapRisk && growthScore < 10)) {
    return {
      trend: "declining",
      status: "fail",
      label: "Declining ⛔",
      reason: valueTrapRisk
        ? `Value trap risk: ROE still ${roe?.toFixed(1)}% but growth score only ${growthScore}/25 — earnings growth has peaked. Avoid averaging down.`
        : `Growth score ${growthScore}/25 — earnings are declining. A falling price may be fully justified.`,
      isGate: true,
    };
  }
  if (growthScore < 12) {
    return {
      trend: "decelerating",
      status: "warn",
      label: "Decelerating ⚠️",
      reason: `Growth score ${growthScore}/25 — earnings growth is slowing. Stock risks becoming "dead money" even if P&L is positive.`,
      isGate: false,
    };
  }
  if (growthScore >= 20 && qualityScore >= 18) {
    return { trend: "accelerating", status: "pass", label: "Accelerating ✅", reason: `Growth score ${growthScore}/25 with quality ${qualityScore}/25 — strong earnings momentum supports adding to position.`, isGate: false };
  }
  return { trend: "stable", status: "pass", label: "Stable ✅", reason: `Growth score ${growthScore}/25 — earnings are stable. Not deteriorating, adequate for averaging down.`, isGate: false };
}

// ─── auto-analysis: sector balance ───────────────────────────────────────────

function analyzeSector(rollup: SectorRollup | undefined): AutoCheck {
  if (!rollup) {
    return { status: "unknown", label: "No data", reason: "Sector allocation data unavailable. Set sector targets in strategy settings." };
  }
  const { status, currentPct, targetPct, deltaPct, name } = rollup;
  if (status === "OVERWEIGHT") {
    return { status: "fail", label: `Overweight +${deltaPct.toFixed(1)}%`, reason: `${name} already overweight (${currentPct.toFixed(1)}% vs ${targetPct.toFixed(1)}% target). Buying more worsens strategic imbalance.` };
  }
  if (status === "UNDERWEIGHT") {
    return { status: "pass", label: `Underweight ${deltaPct.toFixed(1)}%`, reason: `${name} is underweight — adding moves toward your ${targetPct.toFixed(1)}% strategy target.` };
  }
  if (status === "ON TARGET") {
    return { status: "pass", label: "On target", reason: `${name} within ±2% of ${targetPct.toFixed(1)}% target. Sector balance is acceptable.` };
  }
  return { status: "warn", label: "No target set", reason: `No allocation target for ${name}. Set a sector target to enable auto-check.` };
}

// ─── auto-analysis: decline type A1/A2/A3/B/C ────────────────────────────────

function classifyDeclineType(
  fundRow: FundamentalAnalysisRow | undefined,
  sectorAvgTech: number | null,
  thisTechScore: number | null,
): DeclineCheck {
  const noData: DeclineCheck = {
    type: "unknown", label: "Cannot classify", danger: "medium", score: 6,
    reason: "Insufficient data to classify decline type.",
    detail: "No sector peer data or fundamental snapshot available.",
    isHardStop: false,
  };
  if (!fundRow) return noData;

  const { finalScore, growthScore, qualityScore, valuationScore } = fundRow.breakdown;
  const roe = fundRow.roe ?? 0;
  const pe = fundRow.pe ?? 0;

  // Type C — Broken business (hard stop)
  if (finalScore < 38 || (qualityScore < 8 && growthScore < 8)) {
    return {
      type: "C", label: "Type C — Broken Business", danger: "critical", score: 0,
      reason: "Multiple fundamental failures point to a structurally impaired business.",
      detail: `F-Score ${finalScore}/100, quality ${qualityScore}/25, growth ${growthScore}/25 — the business model appears broken.`,
      isHardStop: true,
    };
  }

  // Type A3 — Cycle peak (very dangerous)
  if (roe > 15 && growthScore < 10 && pe > 20 && (sectorAvgTech === null || sectorAvgTech > 40)) {
    return {
      type: "A3", label: "Type A3 — Cycle Peak", danger: "high", score: 3,
      reason: "Earnings still look high (ROE strong) but growth has peaked — valuation multiples are likely compressing.",
      detail: `ROE ${roe.toFixed(1)}% appears strong but growth score only ${growthScore}/25 at P/E ${pe.toFixed(1)}×. Market may be pricing in a coming earnings decline.`,
      isHardStop: false,
    };
  }

  // Type A2 — Sector re-rating (dangerous)
  const sectorRerating = (pe > 22 && valuationScore < 18) ||
    (sectorAvgTech !== null && sectorAvgTech > 42 && sectorAvgTech < 56 && valuationScore < 20);
  if (sectorRerating) {
    return {
      type: "A2", label: "Type A2 — Sector Re-rating", danger: "high", score: 6,
      reason: "Sector multiples are compressing — the market is permanently reassigning a lower P/E to this sector.",
      detail: `P/E ${pe > 0 ? pe.toFixed(1) + "×" : "n/a"} with valuation score ${valuationScore}/40. ${sectorAvgTech !== null ? `Sector avg tech ${sectorAvgTech} — mixed signals.` : ""}`,
      isHardStop: false,
    };
  }

  // Type B — Company-specific issue
  const companySpecific =
    (sectorAvgTech !== null && sectorAvgTech > 50 && thisTechScore !== null && thisTechScore < 40) ||
    (finalScore < 52 && sectorAvgTech !== null && sectorAvgTech > 45);
  if (companySpecific) {
    return {
      type: "B", label: "Type B — Company Issue", danger: "medium", score: 5,
      reason: "Sector peers are healthier than this stock — decline appears company-specific.",
      detail: `${sectorAvgTech !== null ? `Sector avg tech ${sectorAvgTech} vs this stock ${thisTechScore ?? "?"}.` : ""} Monitor next earnings report before adding.`,
      isHardStop: false,
    };
  }

  // Type A1 — Macro panic (best case)
  if (sectorAvgTech !== null && sectorAvgTech < 45 && finalScore >= 55 && growthScore >= 12) {
    return {
      type: "A1", label: "Type A1 — Macro Panic", danger: "low", score: 12,
      reason: "Broad market/sector weakness while company fundamentals remain strong. Historically the best setup for averaging down.",
      detail: `Sector avg tech score ${sectorAvgTech} (weak market) while F-Score ${finalScore} and growth ${growthScore}/25 remain solid.`,
      isHardStop: false,
    };
  }

  // A1 with less data confidence
  if (finalScore >= 58 && growthScore >= 14) {
    return {
      type: "A1", label: "Type A1 — Likely Macro/Sentiment", danger: "low", score: 10,
      reason: "Fundamentals are strong — decline is more likely external/sentiment-driven than company-specific.",
      detail: `F-Score ${finalScore}, growth ${growthScore}/25. ${sectorAvgTech !== null ? `Sector avg tech: ${sectorAvgTech}.` : "No sector tech data."}`,
      isHardStop: false,
    };
  }

  // B fallback
  return {
    type: "B", label: "Type B — Mixed / Company Factors", danger: "medium", score: 5,
    reason: "Decline shows mixed signals — cannot rule out company-specific factors.",
    detail: `F-Score ${finalScore}/100, growth ${growthScore}/25. Requires further investigation.`,
    isHardStop: false,
  };
}

// ─── auto-analysis: position size ────────────────────────────────────────────

function analyzePositionSize(weightPct: number | null): AutoCheck {
  if (weightPct === null) return { status: "unknown", label: "No data", reason: "Position weight unavailable — current price missing." };
  if (weightPct > 25) return { status: "fail", label: `Too heavy — ${weightPct.toFixed(1)}%`, reason: `Already ${weightPct.toFixed(1)}% of portfolio — exceeds 25% limit. Averaging down amplifies concentration risk.` };
  if (weightPct > 18) return { status: "warn", label: `Approaching limit — ${weightPct.toFixed(1)}%`, reason: `${weightPct.toFixed(1)}% is near the 20–25% single-stock guideline. Only add with high conviction.` };
  return { status: "pass", label: `Within limits — ${weightPct.toFixed(1)}%`, reason: `${weightPct.toFixed(1)}% of portfolio — well within the 25% guideline.` };
}

// ─── auto-analysis: valuation (3-part) ───────────────────────────────────────

function analyzeValuation3Part(
  fundRow: FundamentalAnalysisRow | undefined,
  sectorRollup: SectorRollup | undefined,
  gainPct: number | null,
): ValuationCheck {
  const noData: ValuationCheck = {
    historical: "unknown", peer: "unknown", growthAdj: "unknown",
    partsPass: 0, overallStatus: "unknown",
    label: "No data", reason: "No valuation data available. Review P/E vs sector average manually.",
    bullets: [], peerAvgPE: null,
  };
  if (!fundRow) return noData;

  const { valuationScore, growthScore } = fundRow.breakdown;
  const pe = fundRow.pe;
  const pb = fundRow.pb;
  const roe = fundRow.roe;
  const priceDrop = gainPct ?? 0;
  const bullets: string[] = [];

  // Part 1: Historical (proxy via valuationScore)
  let historical: AutoStatus;
  if (valuationScore >= 28) {
    historical = "pass";
    bullets.push(`✅ Historical: Val score ${valuationScore}/40 — cheap vs own metrics`);
  } else if (valuationScore >= 18) {
    historical = "warn";
    bullets.push(`⚠️ Historical: Val score ${valuationScore}/40 — fair, not clearly cheap`);
  } else {
    historical = "fail";
    bullets.push(`❌ Historical: Val score ${valuationScore}/40 — expensive vs own history`);
  }

  // Part 2: Peer comparison (sector average P/E)
  let peer: AutoStatus = "unknown";
  let peerAvgPE: number | null = null;
  if (pe != null && pe > 0 && sectorRollup) {
    const peerPEs = sectorRollup.stocks
      .filter((s) => s.peRatio != null && s.peRatio > 2 && s.peRatio < 80)
      .map((s) => s.peRatio as number);
    if (peerPEs.length >= 2) {
      peerAvgPE = peerPEs.reduce((a, b) => a + b, 0) / peerPEs.length;
      const ratio = pe / peerAvgPE;
      if (ratio < 0.82) {
        peer = "pass";
        bullets.push(`✅ Peer: P/E ${pe.toFixed(1)}× vs sector avg ${peerAvgPE.toFixed(1)}× — cheap vs peers`);
      } else if (ratio < 1.08) {
        peer = "warn";
        bullets.push(`⚠️ Peer: P/E ${pe.toFixed(1)}× ≈ sector avg ${peerAvgPE.toFixed(1)}× — fairly valued vs peers`);
      } else {
        peer = "fail";
        bullets.push(`❌ Peer: P/E ${pe.toFixed(1)}× > sector avg ${peerAvgPE.toFixed(1)}× — expensive vs peers`);
      }
    } else {
      peer = "unknown";
      bullets.push(`⚠️ Peer: Not enough sector P/E data (${peerPEs.length} peers)`);
    }
  } else if (pe != null && pe > 0) {
    peer = pe < 15 ? "pass" : pe < 22 ? "warn" : "fail";
    bullets.push(`${peer === "pass" ? "✅" : peer === "warn" ? "⚠️" : "❌"} Peer: P/E ${pe.toFixed(1)}× (no sector avg — using absolute threshold)`);
  } else {
    bullets.push("⚠️ Peer: P/E not available");
  }

  // Part 3: Growth-adjusted valuation
  let growthAdj: AutoStatus;
  if (pe != null && pe > 0) {
    // Proxy annual growth % from growthScore: scale 0-25 → 0-30%
    const proxyGrowthPct = Math.max(1, (growthScore / 25) * 30);
    const impliedPeg = pe / proxyGrowthPct;
    if (impliedPeg < 1.2) {
      growthAdj = "pass";
      bullets.push(`✅ Growth-adj: Implied PEG ~${impliedPeg.toFixed(2)} — attractive on growth basis`);
    } else if (impliedPeg < 2.2) {
      growthAdj = "warn";
      bullets.push(`⚠️ Growth-adj: Implied PEG ~${impliedPeg.toFixed(2)} — fair, growth not fully justifying price`);
    } else {
      growthAdj = "fail";
      bullets.push(`❌ Growth-adj: Implied PEG ~${impliedPeg.toFixed(2)} — expensive on growth basis (growth score ${growthScore}/25)`);
    }
  } else {
    growthAdj = "unknown";
    bullets.push("⚠️ Growth-adj: P/E unavailable — cannot compute growth-adjusted value");
  }

  // Summary
  const statuses = [historical, peer, growthAdj];
  const partsPass = statuses.filter((s) => s === "pass").length;
  const partsFail = statuses.filter((s) => s === "fail").length;

  let overallStatus: AutoStatus;
  let label: string;
  let reason: string;

  if (partsPass === 3) {
    overallStatus = "pass"; label = "All 3 parts attractive"; reason = "Historical, peer, and growth-adjusted valuation all indicate the stock is cheap. Strong case for adding.";
  } else if (partsPass === 2) {
    overallStatus = "pass"; label = "2/3 parts attractive"; reason = "Two of three valuation checks pass — the stock is likely cheaper than your original entry.";
  } else if (partsPass === 1) {
    overallStatus = "warn"; label = "Only 1/3 attractive ⚠️";
    reason = `Only one valuation check passes — the stock is NOT clearly cheap${priceDrop < -10 ? ` despite the ${priceDrop.toFixed(1)}% price drop` : ""}. Score is capped at 65.`;
  } else {
    overallStatus = "fail"; label = "0/3 — Not cheap";
    reason = "All three valuation checks fail — the price drop has NOT made this stock cheap. Earnings may have fallen more than price. Score is capped at 50.";
  }

  // Extra context
  if (pe != null) bullets.push(`P/E: ${pe.toFixed(1)}×`);
  if (pb != null) bullets.push(`P/B: ${pb.toFixed(2)}×`);
  if (roe != null) bullets.push(`ROE: ${roe.toFixed(1)}%`);

  return { historical, peer, growthAdj, partsPass, overallStatus, label, reason, bullets, peerAvgPE };
}

// ─── auto-analysis: catalyst ─────────────────────────────────────────────────

function analyzeCatalyst(
  fundRow: FundamentalAnalysisRow | undefined,
  sectorRollup: SectorRollup | undefined,
): AutoCheck {
  if (!fundRow) {
    return { status: "unknown", label: "No data", reason: "Cannot assess catalyst without fundamental data." };
  }
  const { growthScore, qualityScore } = fundRow.breakdown;

  const catalysts: string[] = [];

  // Check for clear catalysts
  if (growthScore >= 18 && qualityScore >= 15) catalysts.push("Earnings recovery path — strong growth metrics");
  if (sectorRollup?.status === "UNDERWEIGHT") catalysts.push("Sector rebalancing tailwind — sector is underweight");
  if (fundRow.roe != null && fundRow.roe >= 20 && growthScore >= 14) catalysts.push("High-ROE compounder with sustained growth");

  if (catalysts.length >= 2) {
    return { status: "pass", label: "Clear catalyst", reason: "Multiple identifiable recovery paths within 12–18 months.", bullets: catalysts };
  }
  if (catalysts.length === 1) {
    return { status: "pass", label: "Catalyst identified", reason: catalysts[0] };
  }

  // Partial/unclear
  if (growthScore >= 12) {
    const possible: string[] = [];
    if (growthScore >= 14) possible.push("Moderate growth — possible earnings expansion if margins recover");
    if (sectorRollup?.status === "ON TARGET") possible.push("Sector balance stable — no structural headwind");
    return {
      status: "warn", label: "Possible — timeline unclear",
      reason: `Growth score ${growthScore}/25 — a recovery path may exist but timing is uncertain (could be 2–3+ years).`,
      bullets: possible,
    };
  }

  // No visible catalyst
  return {
    status: "fail", label: "No visible catalyst ❌",
    reason: `Growth score ${growthScore}/25 is too low to identify a recovery driver. Risk of becoming "dead money" for years.`,
    bullets: ["No earnings recovery signal", "No sector tailwind detected", "Consider waiting for a catalyst to emerge before adding"],
  };
}

// ─── auto-analysis: opportunity cost ─────────────────────────────────────────

function analyzeOpportunityCost(
  symbol: string,
  fundRow: FundamentalAnalysisRow | undefined,
  combinedRows: CombinedAnalysisRow[] | undefined,
  allFundRows: FundamentalAnalysisRow[],
): AutoCheck {
  if (!fundRow) return { status: "unknown", label: "No data", reason: "Cannot rank opportunity without fundamental data." };

  // Use combined score if available, else fund score
  const thisRow = combinedRows?.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase());
  const thisScore = thisRow?.combinedScore ?? fundRow.breakdown.finalScore;

  const allScores = combinedRows?.length
    ? combinedRows.map((r) => r.combinedScore)
    : allFundRows.map((r) => r.breakdown.finalScore);

  if (allScores.length < 2) {
    return { status: "warn", label: "Single holding", reason: "Only one portfolio holding — no comparison baseline." };
  }

  const sorted = [...allScores].sort((a, b) => b - a);
  const rank = sorted.findIndex((s) => s <= thisScore) + 1;
  const percentile = ((allScores.length - rank) / allScores.length) * 100;

  if (percentile >= 65) {
    return {
      status: "pass", label: "Best opportunity",
      reason: `This stock ranks in the top ${Math.round(100 - percentile)}% of your portfolio by combined score (${thisScore}). It is likely your best current averaging-down candidate.`,
    };
  }
  if (percentile >= 30) {
    return {
      status: "warn", label: "Moderate — other options exist",
      reason: `Combined score ${thisScore} puts this in the middle of your portfolio. Consider whether a higher-scoring holding deserves the capital instead.`,
    };
  }
  return {
    status: "fail", label: "Better alternatives exist",
    reason: `Combined score ${thisScore} ranks this stock near the bottom of your portfolio. Capital may generate better returns deployed elsewhere.`,
    bullets: ["Review higher-scoring holdings before averaging down here", "Or hold cash until this stock's fundamentals improve"],
  };
}

// ─── scoring ──────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  thesis: number;       // /20
  fundamentals: number; // /12 (sub-component of fund+earnings)
  earningsTrend: number; // /8 (sub-component of fund+earnings)
  sector: number;       // /8
  decline: number;      // /12 (DeclineCheck.score, max 12)
  position: number;     // /8
  valuation: number;    // /12 (0,4,8,12 based on partsPass)
  horizon: number;      // /5 (fixed = 5 for 1-2yr)
  catalyst: number;     // /8
  opCost: number;       // /7
  rawTotal: number;     // before cap
  cap: number | null;   // null if no cap
  total: number;        // after cap
}

function autoScore(status: AutoStatus, max: number): number {
  if (status === "pass") return max;
  if (status === "warn") return Math.round(max * 0.5);
  if (status === "unknown") return Math.round(max * 0.35);
  return 0;
}

function computeScore(
  thesis: ThesisAnswer,
  checkFund: AutoCheck,
  checkEarnings: EarningsTrendCheck,
  checkSector: AutoCheck,
  declineCheck: DeclineCheck,
  checkPosition: AutoCheck,
  valCheck: ValuationCheck,
  checkCatalyst: AutoCheck,
  checkOpCost: AutoCheck,
): ScoreBreakdown {
  const thesisScore =
    thesis === "yes" ? 20 : thesis === "uncertain" ? 10 : thesis === "no" ? 0 : 0;

  const fundamentalsScore = autoScore(checkFund.status, 12);
  const earningsScore =
    checkEarnings.trend === "accelerating" ? 8
    : checkEarnings.trend === "stable" ? 6
    : checkEarnings.trend === "decelerating" ? 2
    : 0; // declining

  const sectorScore = autoScore(checkSector.status, 8);
  const declineScore = declineCheck.score; // already /12
  const positionScore = autoScore(checkPosition.status, 8);
  const valScore = [0, 4, 8, 12][valCheck.partsPass]; // 0 parts=0, 1=4, 2=8, 3=12
  const horizonScore = 5; // fixed: 1-2yr medium = 5/5
  const catalystScore = autoScore(checkCatalyst.status, 8);
  const opCostScore = autoScore(checkOpCost.status, 7);

  const rawTotal = thesisScore + fundamentalsScore + earningsScore + sectorScore + declineScore +
    positionScore + valScore + horizonScore + catalystScore + opCostScore;

  // Score caps (prevent score illusion)
  let cap: number | null = null;
  if (checkEarnings.trend === "declining") cap = Math.min(cap ?? 100, 55);
  else if (checkEarnings.trend === "decelerating") cap = Math.min(cap ?? 100, 72);
  if (valCheck.partsPass === 0) cap = Math.min(cap ?? 100, 50);
  else if (valCheck.partsPass === 1) cap = Math.min(cap ?? 100, 65);

  const total = cap !== null ? Math.min(rawTotal, cap) : rawTotal;

  return { thesis: thesisScore, fundamentals: fundamentalsScore, earningsTrend: earningsScore, sector: sectorScore, decline: declineScore, position: positionScore, valuation: valScore, horizon: horizonScore, catalyst: catalystScore, opCost: opCostScore, rawTotal, cap, total };
}

// ─── verdict ──────────────────────────────────────────────────────────────────

type Verdict = "AVERAGE DOWN" | "CONSIDER WITH CAUTION" | "CAUTIOUS — SMALL ADD ONLY" | "DO NOT AVERAGE DOWN" | "PENDING";

interface VerdictResult {
  verdict: Verdict;
  score: ScoreBreakdown | null;
  reasons: string[];
  warnings: string[];
}

function computeVerdict(
  thesis: ThesisAnswer,
  checkFund: AutoCheck,
  checkEarnings: EarningsTrendCheck,
  declineCheck: DeclineCheck,
  checkPosition: AutoCheck,
  valCheck: ValuationCheck,
  score: ScoreBreakdown | null,
): VerdictResult {
  if (thesis === null) {
    return { verdict: "PENDING", score: null, reasons: [], warnings: [] };
  }

  const warnings: string[] = [];

  // Hard stops (override score)
  if (thesis === "no") {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: ["Original thesis is broken — averaging down only grows a bad position."], warnings: ["Consider cutting losses and redeploying capital."] };
  }
  if (declineCheck.isHardStop) {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: [declineCheck.reason], warnings: [declineCheck.detail] };
  }
  if (checkEarnings.isGate && checkEarnings.trend === "declining") {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: ["Earnings trend gate: earnings are declining — averaging down buys a deteriorating business."], warnings: [checkEarnings.reason] };
  }
  if (checkFund.status === "fail") {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: ["Fundamentals failing — price decline reflects genuine business deterioration."], warnings: [checkFund.reason] };
  }
  if (checkPosition.status === "fail") {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: ["Position already exceeds 25% concentration limit."], warnings: [checkPosition.reason] };
  }
  if (valCheck.partsPass === 0) {
    return { verdict: "DO NOT AVERAGE DOWN", score, reasons: ["Valuation gate: 0/3 valuation checks pass — stock is not cheap in any dimension."], warnings: [valCheck.reason] };
  }

  if (!score) return { verdict: "PENDING", score: null, reasons: [], warnings: [] };

  // Warnings (non-blocking)
  if (thesis === "uncertain") warnings.push("Uncertain thesis: be honest — is this conviction or loss aversion?");
  if (checkEarnings.trend === "decelerating") warnings.push(`Earnings decelerating (growth score low) — score capped at 72.`);
  if (valCheck.partsPass === 1) warnings.push(`Only 1/3 valuation parts attractive — score capped at 65.`);
  if (declineCheck.type === "A2") warnings.push("Type A2: Sector multiples may be permanently re-rating — not a temporary dip.");
  if (declineCheck.type === "A3") warnings.push("Type A3: Cycle peak — earnings appear to have peaked even if current ROE looks strong.");
  if (declineCheck.type === "B") warnings.push("Type B: Company-specific issue — wait for next earnings before adding.");
  if (score.cap !== null) warnings.push(`Score capped at ${score.cap}/100 due to fundamental or valuation weakness.`);

  if (score.total >= 75) {
    return {
      verdict: warnings.length === 0 ? "AVERAGE DOWN" : "CONSIDER WITH CAUTION",
      score,
      reasons: warnings.length === 0 ? [
        "Thesis intact, earnings trend healthy, sector balance acceptable.",
        "Decline is market-driven (Type A1) — not a business failure.",
        "Valuation is clearly more attractive in at least 2/3 dimensions.",
      ] : ["Score is strong but caution flags exist — proceed with smaller size."],
      warnings,
    };
  }
  if (score.total >= 55) {
    return {
      verdict: "CONSIDER WITH CAUTION", score,
      reasons: [`Score ${score.total}/100 — conditions partly met. Use reduced add size.`],
      warnings,
    };
  }
  if (score.total >= 38) {
    return {
      verdict: "CAUTIOUS — SMALL ADD ONLY", score,
      reasons: [`Score ${score.total}/100 — significant risk factors. If you add, keep it to ≤5% of planned allocation.`],
      warnings: [...warnings, "Most retail investors lose money averaging down under these conditions."],
    };
  }
  return {
    verdict: "DO NOT AVERAGE DOWN", score,
    reasons: [`Score ${score.total}/100 — too many risk factors. Capital is better deployed elsewhere.`],
    warnings,
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: AutoStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (status === "warn") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
  if (status === "fail") return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  return <HelpCircle className="h-3.5 w-3.5 shrink-0 text-subtle" />;
}

function statusBorderBg(status: AutoStatus) {
  if (status === "pass") return "border-emerald-500/25 bg-emerald-500/8";
  if (status === "warn") return "border-amber-500/25 bg-amber-500/8";
  if (status === "fail") return "border-red-500/25 bg-red-500/8";
  return "border-[var(--border)] bg-[var(--bg-secondary)]";
}

function statusTextColor(status: AutoStatus) {
  if (status === "pass") return "text-emerald-700 dark:text-emerald-300";
  if (status === "warn") return "text-amber-700 dark:text-amber-300";
  if (status === "fail") return "text-red-700 dark:text-red-300";
  return "text-subtle";
}

function AutoCheckCard({ step, title, icon, status, label, children }: {
  step: number; title: string; icon: React.ReactNode;
  status: AutoStatus; label: string; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${statusBorderBg(status)}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">{step}</span>
          <span className="text-muted">{icon}</span>
          <p className="text-sm font-semibold text-[var(--fg)]">{title}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusIcon status={status} />
          <span className={`text-xs font-semibold ${statusTextColor(status)}`}>{label}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function CheckOptionBtn({ value, current, onChange, label, color }: {
  value: string; current: string | null; onChange: (v: string) => void; label: string; color: "green" | "red" | "amber";
}) {
  const colorMap = {
    green: current === value ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40" : "text-muted ring-[var(--border)] hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300",
    red: current === value ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/40" : "text-muted ring-[var(--border)] hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300",
    amber: current === value ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/40" : "text-muted ring-[var(--border)] hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
  };
  return (
    <button type="button" onClick={() => onChange(value)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-all ${colorMap[color]}`}>
      {label}
    </button>
  );
}

function ScoreBar({ label, score, max, showCap }: { label: string; score: number; max: number; showCap?: boolean }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : pct >= 30 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-[11px] text-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--card)] ring-1 ring-[var(--border)] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-12 shrink-0 text-right font-mono text-[11px] ${showCap ? "text-amber-500 font-bold" : "text-[var(--fg)]"}`}>
        {score}/{max}
      </span>
    </div>
  );
}

function HoldingRow({ h, totalValueK, selected, onClick }: {
  h: EnrichedHolding; totalValueK: number; selected: boolean; onClick: () => void;
}) {
  const gainPct = h.gainPct;
  const weightPct = totalValueK > 0 && h.currentValueK != null ? (h.currentValueK / totalValueK) * 100 : null;
  return (
    <button type="button" onClick={onClick}
      className={`w-full rounded-xl px-3 py-2.5 text-left transition-all ring-1 ${
        selected ? "bg-[var(--accent-bg)] ring-accent/40" : "bg-[var(--bg-secondary)] ring-[var(--border)] hover:bg-[var(--card)] hover:ring-accent/20"
      }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StockAvatar symbol={h.symbol} sector={h.sector ?? undefined} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={`/stocks/${h.symbol}`} className="text-sm font-semibold text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}>{h.symbol}</Link>
              {gainPct !== null && gainPct < 0 && <TrendingDown className="h-3 w-3 shrink-0 text-red-500" />}
              {gainPct !== null && gainPct > 0 && <TrendingUp className="h-3 w-3 shrink-0 text-emerald-500" />}
            </div>
            <div className="truncate text-[10px] text-subtle">{h.sector ?? "Unknown"}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {gainPct !== null
            ? <span className={`font-mono text-xs font-semibold ${gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}>{gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%</span>
            : <span className="font-mono text-xs text-subtle">—</span>}
          {weightPct !== null && <div className="text-[10px] text-subtle">{weightPct.toFixed(1)}% wt</div>}
        </div>
      </div>
    </button>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function AverageDownPanel({
  holdings,
  fundamentalRows,
  combinedRows,
  sectorAnalysis,
}: {
  holdings: EnrichedHolding[];
  fundamentalRows: FundamentalAnalysisRow[];
  combinedRows?: CombinedAnalysisRow[];
  sectorAnalysis?: SectorAnalysisResult;
}) {
  const sorted = useMemo(() =>
    [...holdings].sort((a, b) => (a.gainPct ?? 0) - (b.gainPct ?? 0)),
    [holdings],
  );

  const [selected, setSelected] = useState<string | null>(() => sorted[0]?.symbol ?? null);
  const [thesisMap, setThesisMap] = useState<Record<string, ThesisAnswer>>({});
  const [showDeclineDetail, setShowDeclineDetail] = useState(false);

  const totalValueK = holdings.reduce((sum, h) => sum + (h.currentValueK ?? h.costBasis), 0);

  const holding = holdings.find((h) => h.symbol === selected);
  const fundRow = fundamentalRows.find((r) => r.symbol.toUpperCase() === selected?.toUpperCase());

  const weightPct = totalValueK > 0 && holding?.currentValueK != null
    ? (holding.currentValueK / totalValueK) * 100 : null;

  const sectorRollup = useMemo(() => {
    if (!selected || !sectorAnalysis) return undefined;
    return (
      sectorAnalysis.sectors.find((s) => s.stocks.some((st) => st.symbol === selected)) ??
      sectorAnalysis.sectors.find((s) =>
        s.name.toLowerCase().includes((holding?.sector ?? "").toLowerCase().split(" ")[0])
      )
    );
  }, [selected, sectorAnalysis, holding?.sector]);

  const thisCombined = combinedRows?.find((r) => r.symbol.toUpperCase() === selected?.toUpperCase());
  const sectorAvgTech = useMemo(() => {
    const peers = sectorRollup?.stocks.filter((s) => s.symbol !== selected) ?? [];
    return peers.length >= 2 ? Math.round(peers.reduce((s, p) => s + p.techScore, 0) / peers.length) : null;
  }, [sectorRollup, selected]);
  const thisTechScore = thisCombined?.technicalScore ?? sectorRollup?.stocks.find((s) => s.symbol === selected)?.techScore ?? null;

  // All auto checks
  const checkFund = useMemo(() => analyzeFundamentals(fundRow), [fundRow]);
  const checkEarnings = useMemo(() => analyzeEarningsTrend(fundRow), [fundRow]);
  const checkSector = useMemo(() => analyzeSector(sectorRollup), [sectorRollup]);
  const declineCheck = useMemo(() => classifyDeclineType(fundRow, sectorAvgTech, thisTechScore), [fundRow, sectorAvgTech, thisTechScore]);
  const checkPosition = useMemo(() => analyzePositionSize(weightPct), [weightPct]);
  const valCheck = useMemo(() => analyzeValuation3Part(fundRow, sectorRollup, holding?.gainPct ?? null), [fundRow, sectorRollup, holding?.gainPct]);
  const checkCatalyst = useMemo(() => analyzeCatalyst(fundRow, sectorRollup), [fundRow, sectorRollup]);
  const checkOpCost = useMemo(() => analyzeOpportunityCost(selected ?? "", fundRow, combinedRows, fundamentalRows), [selected, fundRow, combinedRows, fundamentalRows]);

  const thesis = selected ? (thesisMap[selected] ?? null) : null;

  const score = useMemo(() => thesis !== null
    ? computeScore(thesis, checkFund, checkEarnings, checkSector, declineCheck, checkPosition, valCheck, checkCatalyst, checkOpCost)
    : null,
    [thesis, checkFund, checkEarnings, checkSector, declineCheck, checkPosition, valCheck, checkCatalyst, checkOpCost],
  );

  const verdictResult = useMemo(() =>
    computeVerdict(thesis, checkFund, checkEarnings, declineCheck, checkPosition, valCheck, score),
    [thesis, checkFund, checkEarnings, declineCheck, checkPosition, valCheck, score],
  );

  const verdictStyle: Record<Verdict, string> = {
    "AVERAGE DOWN": "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    "CONSIDER WITH CAUTION": "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    "CAUTIOUS — SMALL ADD ONLY": "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200",
    "DO NOT AVERAGE DOWN": "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
    "PENDING": "border-[var(--border)] bg-[var(--bg-secondary)] text-muted",
  };
  const verdictIcon: Record<Verdict, React.ReactNode> = {
    "AVERAGE DOWN": <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    "CONSIDER WITH CAUTION": <AlertTriangle className="h-5 w-5 text-amber-500" />,
    "CAUTIOUS — SMALL ADD ONLY": <AlertTriangle className="h-5 w-5 text-orange-500" />,
    "DO NOT AVERAGE DOWN": <XCircle className="h-5 w-5 text-red-500" />,
    "PENDING": <HelpCircle className="h-5 w-5 text-subtle" />,
  };

  const dangerColor: Record<DeclineCheck["danger"], string> = {
    low: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 ring-emerald-500/20",
    medium: "text-amber-700 dark:text-amber-300 bg-amber-500/10 ring-amber-500/20",
    high: "text-orange-700 dark:text-orange-300 bg-orange-500/10 ring-orange-500/20",
    critical: "text-red-700 dark:text-red-300 bg-red-500/10 ring-red-500/20",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1px_1fr]">
      {/* Left — holding list */}
      <div className="space-y-1.5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-[var(--fg)]">Holdings</p>
          <p className="text-[11px] text-muted">Sorted: worst loss first</p>
        </div>
        {sorted.length === 0
          ? <p className="py-4 text-center text-sm text-muted">No holdings found.</p>
          : sorted.map((h) => (
            <HoldingRow key={h.symbol} h={h} totalValueK={totalValueK}
              selected={selected === h.symbol}
              onClick={() => { setSelected((p) => p === h.symbol ? null : h.symbol); setShowDeclineDetail(false); }}
            />
          ))}
      </div>

      {/* Divider */}
      <div className="hidden bg-[var(--border)] lg:block" />

      {/* Right — analysis */}
      <div>
        {!selected ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <TrendingDown className="mb-3 h-10 w-10 text-subtle" />
            <p className="text-sm font-semibold text-[var(--fg)]">Average Down Analyzer</p>
            <p className="mt-1 max-w-sm text-xs text-muted">Select a holding to run the 9-check framework. Checks are auto-analyzed from your data.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Stock header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/stocks/${holding?.symbol}`} className="text-base font-bold text-accent hover:underline">{holding?.symbol}</Link>
                  {holding?.name && <span className="text-xs text-muted">{holding.name}</span>}
                </div>
                <p className="text-[11px] text-subtle">{holding?.sector}</p>
              </div>
              <div className="text-right">
                {holding?.currentPriceK != null && <p className="font-mono text-sm font-semibold text-[var(--fg)]">{(holding.currentPriceK * 1000).toLocaleString()} ₫</p>}
                {holding?.gainPct != null && (
                  <p className={`font-mono text-xs font-semibold ${holding.gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}>
                    {holding.gainPct >= 0 ? "+" : ""}{holding.gainPct.toFixed(2)}% from avg cost
                  </p>
                )}
              </div>
            </div>

            {/* Price strip */}
            {holding && (
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
                <div><p className="text-[10px] uppercase tracking-wider text-subtle">Avg Buy</p><p className="font-mono text-xs font-semibold text-[var(--fg)]">{(holding.avgBuyPrice * 1000).toLocaleString()} ₫</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-subtle">Current</p><p className={`font-mono text-xs font-semibold ${holding.gainPct != null && holding.gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}>{holding.currentPriceK != null ? `${(holding.currentPriceK * 1000).toLocaleString()} ₫` : "—"}</p></div>
                <div><p className="text-[10px] uppercase tracking-wider text-subtle">Portfolio wt</p><p className="font-mono text-xs font-semibold text-[var(--fg)]">{weightPct != null ? `${weightPct.toFixed(1)}%` : "—"}</p></div>
              </div>
            )}

            {/* ── 1. Thesis (only interactive check) ─────────────── */}
            <div className="rounded-xl bg-[var(--bg-secondary)] p-3.5 ring-1 ring-[var(--border)]">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">1</span>
                <Target className="h-4 w-4 text-muted" />
                <p className="text-sm font-semibold text-[var(--fg)]">Investment Thesis</p>
                <span className="ml-auto text-[10px] text-subtle italic">Your decision</span>
              </div>
              <p className="mb-3 text-xs italic text-muted">&ldquo;If I didn&apos;t own this stock today, would I still buy it at the current price?&rdquo;</p>
              <div className="flex flex-wrap gap-2">
                <CheckOptionBtn value="yes" current={thesis} onChange={(v) => setThesisMap((p) => ({ ...p, [selected]: v as ThesisAnswer }))} label="✅ Yes — still a buy" color="green" />
                <CheckOptionBtn value="uncertain" current={thesis} onChange={(v) => setThesisMap((p) => ({ ...p, [selected]: v as ThesisAnswer }))} label="⚠️ Uncertain" color="amber" />
                <CheckOptionBtn value="no" current={thesis} onChange={(v) => setThesisMap((p) => ({ ...p, [selected]: v as ThesisAnswer }))} label="❌ No — thesis broken" color="red" />
              </div>
              {thesis === "uncertain" && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">⚠️ Uncertainty often signals loss aversion — be honest about conviction level.</p>}
              {thesis === null && <p className="mt-2 text-[11px] text-subtle">Answer this to generate the verdict.</p>}
            </div>

            {/* ── 2. Fundamentals + Earnings Trend (merged, auto) ─── */}
            <AutoCheckCard step={2} title="Fundamentals & Earnings Trend" icon={<Scale className="h-4 w-4" />}
              status={checkFund.status === "fail" || checkEarnings.status === "fail" ? "fail" : checkFund.status === "warn" || checkEarnings.status === "warn" ? "warn" : "pass"}
              label={checkEarnings.status === "fail" ? `${checkFund.label} · ${checkEarnings.label}` : `${checkFund.label} · ${checkEarnings.label}`}>
              {fundRow && (
                <div className="mb-2 grid grid-cols-4 gap-1.5">
                  {[
                    { label: "F-Score", value: fundRow.breakdown.finalScore, suffix: "" },
                    { label: "ROE", value: fundRow.roe, suffix: "%" },
                    { label: "Growth", value: fundRow.breakdown.growthScore, suffix: "/25" },
                    { label: "Quality", value: fundRow.breakdown.qualityScore, suffix: "/25" },
                  ].map(({ label, value, suffix }) => (
                    <div key={label} className="rounded-lg bg-[var(--card)] p-1.5 text-center ring-1 ring-[var(--border)]">
                      <p className="text-[9px] uppercase tracking-wider text-subtle">{label}</p>
                      <p className="font-mono text-xs font-semibold text-[var(--fg)]">
                        {value != null ? `${typeof value === "number" ? (suffix === "%" ? value.toFixed(1) : value) : value}${suffix}` : "—"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted">{checkFund.reason}</p>
              {checkEarnings.isGate && checkEarnings.trend === "declining" ? (
                <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-2 ring-1 ring-red-500/20">
                  <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">⛔ Earnings Gate: {checkEarnings.reason}</p>
                </div>
              ) : (
                <p className={`mt-1 text-[11px] ${statusTextColor(checkEarnings.status)}`}>{checkEarnings.label} — {checkEarnings.reason}</p>
              )}
            </AutoCheckCard>

            {/* ── 3. Sector Balance (auto) ───────────────────────── */}
            <AutoCheckCard step={3} title="Sector Balance" icon={<Scale className="h-4 w-4" />} status={checkSector.status} label={checkSector.label}>
              {sectorRollup && (
                <div className="mb-2 flex items-center gap-3 rounded-lg bg-[var(--card)] p-2 ring-1 ring-[var(--border)]">
                  <div>
                    <p className="text-xs font-semibold text-[var(--fg)]">{sectorRollup.name}</p>
                    <p className="text-[10px] text-subtle">{sectorRollup.currentPct.toFixed(1)}% current · {sectorRollup.targetPct.toFixed(1)}% target
                      <span className={sectorRollup.deltaPct > 2 ? " text-amber-500" : sectorRollup.deltaPct < -2 ? " text-blue-500" : " text-emerald-500"}> ({sectorRollup.deltaPct > 0 ? "+" : ""}{sectorRollup.deltaPct.toFixed(1)}%)</span>
                    </p>
                  </div>
                  <Badge variant={sectorRollup.status === "ON TARGET" ? "success" : sectorRollup.status === "OVERWEIGHT" ? "warning" : sectorRollup.status === "UNDERWEIGHT" ? "info" : "default"} className="ml-auto shrink-0 text-[10px]">{sectorRollup.status}</Badge>
                </div>
              )}
              <p className="text-xs text-muted">{checkSector.reason}</p>
            </AutoCheckCard>

            {/* ── 4. Decline Type A1/A2/A3/B/C (auto) ──────────── */}
            <div className={`rounded-xl border p-3.5 ${
              declineCheck.danger === "low" ? "border-emerald-500/25 bg-emerald-500/8"
              : declineCheck.danger === "medium" ? "border-amber-500/25 bg-amber-500/8"
              : declineCheck.danger === "high" ? "border-orange-500/25 bg-orange-500/8"
              : "border-red-500/25 bg-red-500/8"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">4</span>
                  <Lightbulb className="h-4 w-4 text-muted" />
                  <p className="text-sm font-semibold text-[var(--fg)]">Decline Classification</p>
                </div>
                <div className={`rounded-lg px-2 py-1 text-xs font-bold ring-1 ${dangerColor[declineCheck.danger]}`}>
                  {declineCheck.label}
                </div>
              </div>
              <p className="text-xs text-muted">{declineCheck.reason}</p>
              <button type="button" onClick={() => setShowDeclineDetail((p) => !p)}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-accent hover:underline">
                {showDeclineDetail ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {showDeclineDetail ? "Hide" : "Show"} detail
              </button>
              {showDeclineDetail && (
                <div className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-2">
                  <p className="text-[11px] text-muted">{declineCheck.detail}</p>
                  {sectorAvgTech !== null && (
                    <div className="flex gap-4 text-[10px] text-subtle">
                      <span>Sector avg tech: <span className="font-mono font-semibold text-[var(--fg)]">{sectorAvgTech}</span></span>
                      {thisTechScore !== null && <span>This stock tech: <span className={`font-mono font-semibold ${thisTechScore < (sectorAvgTech ?? 50) - 10 ? "text-red-500" : "text-[var(--fg)]"}`}>{thisTechScore}</span></span>}
                    </div>
                  )}
                  <p className="text-[10px] text-subtle italic">Type A1 = macro panic (good) · A2 = sector re-rating (risky) · A3 = cycle peak (very risky) · B = company issue · C = broken (hard stop)</p>
                </div>
              )}
            </div>

            {/* ── 5. Position Size (auto) ─────────────────────────── */}
            <AutoCheckCard step={5} title="Position Sizing" icon={<Scale className="h-4 w-4" />} status={checkPosition.status} label={checkPosition.label}>
              {weightPct !== null && (
                <div className="mb-2 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-subtle">Portfolio weight</span>
                    <span className={`font-mono font-semibold ${weightPct > 25 ? "text-red-500" : weightPct > 18 ? "text-amber-500" : "text-emerald-500"}`}>{weightPct.toFixed(1)}% / 25% limit</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--card)] ring-1 ring-[var(--border)]">
                    <div className={`h-full rounded-full ${weightPct > 25 ? "bg-red-500" : weightPct > 18 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min((weightPct / 25) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
              <p className="text-xs text-muted">{checkPosition.reason}</p>
            </AutoCheckCard>

            {/* ── 6. Valuation 3-part (auto) ──────────────────────── */}
            <AutoCheckCard step={6} title="Valuation — 3-Part Analysis" icon={<Scale className="h-4 w-4" />} status={valCheck.overallStatus} label={valCheck.label}>
              <div className="mb-2 flex gap-2">
                {[
                  { label: "Historical", status: valCheck.historical },
                  { label: "vs Peers", status: valCheck.peer },
                  { label: "Growth-adj", status: valCheck.growthAdj },
                ].map(({ label, status }) => (
                  <div key={label} className={`flex-1 rounded-lg border px-2 py-1.5 text-center ${statusBorderBg(status)}`}>
                    <p className="text-[9px] uppercase tracking-wider text-subtle">{label}</p>
                    <StatusIcon status={status} />
                  </div>
                ))}
              </div>
              {valCheck.bullets.slice(0, 3).map((b) => (
                <p key={b} className="text-[11px] text-muted">{b}</p>
              ))}
              <p className="mt-1 text-xs text-muted">{valCheck.reason}</p>
              {valCheck.peerAvgPE != null && (
                <p className="text-[10px] text-subtle">Sector avg P/E: {valCheck.peerAvgPE.toFixed(1)}×</p>
              )}
            </AutoCheckCard>

            {/* ── 7. Time Horizon (auto: fixed 1-2yr) ────────────── */}
            <AutoCheckCard step={7} title="Time Horizon" icon={<Clock className="h-4 w-4" />} status="pass" label="1–2 year holding period">
              <p className="text-xs text-muted">Assumed 1–2 year holding period for this framework. Averaging down is only appropriate for medium-term fundamental stories — not short-term rebounds or break-even exits.</p>
            </AutoCheckCard>

            {/* ── 8. Catalyst (auto) ─────────────────────────────── */}
            <AutoCheckCard step={8} title="Catalyst & Recovery Path" icon={<Target className="h-4 w-4" />} status={checkCatalyst.status} label={checkCatalyst.label}>
              <p className="text-xs text-muted">{checkCatalyst.reason}</p>
              {checkCatalyst.bullets && checkCatalyst.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {checkCatalyst.bullets.map((b) => <li key={b} className="flex items-center gap-1.5 text-[11px] text-muted"><span className="text-subtle">·</span>{b}</li>)}
                </ul>
              )}
            </AutoCheckCard>

            {/* ── 9. Opportunity Cost (auto) ─────────────────────── */}
            <AutoCheckCard step={9} title="Opportunity Cost" icon={<Scale className="h-4 w-4" />} status={checkOpCost.status} label={checkOpCost.label}>
              <p className="text-xs text-muted">{checkOpCost.reason}</p>
              {checkOpCost.bullets && checkOpCost.bullets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {checkOpCost.bullets.map((b) => <li key={b} className="flex items-center gap-1.5 text-[11px] text-muted"><span className="text-subtle">·</span>{b}</li>)}
                </ul>
              )}
            </AutoCheckCard>

            {/* ── Score Breakdown ─────────────────────────────────── */}
            {score && (
              <div className="rounded-xl bg-[var(--bg-secondary)] p-4 ring-1 ring-[var(--border)]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--fg)]">Score</p>
                  <div className="flex items-center gap-2">
                    {score.cap !== null && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">capped at {score.cap}</span>
                    )}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-2 ${
                      score.total >= 75 ? "bg-emerald-500/15 ring-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : score.total >= 55 ? "bg-amber-500/15 ring-amber-500/40 text-amber-700 dark:text-amber-300"
                      : score.total >= 38 ? "bg-orange-500/15 ring-orange-500/40 text-orange-700 dark:text-orange-300"
                      : "bg-red-500/15 ring-red-500/40 text-red-700 dark:text-red-300"
                    }`}>{score.total}</div>
                    <span className="text-xs text-muted">/ 100</span>
                  </div>
                </div>
                {/* Master bar */}
                <div className="mb-1">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--card)] ring-1 ring-[var(--border)]">
                    <div className={`h-full rounded-full transition-all ${score.total >= 75 ? "bg-emerald-500" : score.total >= 55 ? "bg-amber-500" : score.total >= 38 ? "bg-orange-500" : "bg-red-500"}`}
                      style={{ width: `${score.total}%` }} />
                    {score.cap !== null && (
                      <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-amber-400"
                        style={{ left: `${score.cap}%` }} />
                    )}
                  </div>
                  <div className="mt-0.5 flex justify-between text-[9px] text-subtle">
                    <span>0</span><span className="text-orange-500">38</span><span className="text-amber-500">55</span><span className="text-emerald-500">75</span><span>100</span>
                  </div>
                </div>
                {/* Per-check bars */}
                <div className="mt-3 space-y-1.5">
                  <ScoreBar label="1. Thesis" score={score.thesis} max={20} />
                  <ScoreBar label="2. Fundamentals" score={score.fundamentals} max={12} />
                  <ScoreBar label="   Earnings trend" score={score.earningsTrend} max={8} showCap={score.cap !== null && checkEarnings.trend === "declining"} />
                  <ScoreBar label="3. Sector" score={score.sector} max={8} />
                  <ScoreBar label="4. Decline type" score={score.decline} max={12} />
                  <ScoreBar label="5. Position size" score={score.position} max={8} />
                  <ScoreBar label="6. Valuation (3pt)" score={score.valuation} max={12} showCap={score.cap !== null && valCheck.partsPass <= 1} />
                  <ScoreBar label="7. Time horizon" score={score.horizon} max={5} />
                  <ScoreBar label="8. Catalyst" score={score.catalyst} max={8} />
                  <ScoreBar label="9. Opp. cost" score={score.opCost} max={7} />
                  {score.cap !== null && (
                    <p className="pt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      ⚠️ Raw score was {score.rawTotal} — capped at {score.cap} due to {checkEarnings.trend === "declining" ? "earnings declining" : checkEarnings.trend === "decelerating" ? "earnings decelerating" : ""}{valCheck.partsPass <= 1 ? `${checkEarnings.trend !== "stable" ? " and " : ""}valuation only ${valCheck.partsPass}/3 pass` : ""}.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Verdict ─────────────────────────────────────────── */}
            <div className={`rounded-xl border p-4 ${verdictStyle[verdictResult.verdict]}`}>
              <div className="flex items-center gap-2.5">
                {verdictIcon[verdictResult.verdict]}
                <div>
                  <p className="text-base font-bold">{verdictResult.verdict === "PENDING" ? "Answer Check 1 to get verdict" : verdictResult.verdict}</p>
                  {score && verdictResult.verdict !== "PENDING" && <p className="text-[11px] opacity-70">Score: {score.total}/100{score.cap !== null ? ` (capped from ${score.rawTotal})` : ""}</p>}
                </div>
              </div>
              {verdictResult.reasons.length > 0 && (
                <ul className="mt-2 ml-1 space-y-0.5">
                  {verdictResult.reasons.map((r) => <li key={r} className="text-xs">{r}</li>)}
                </ul>
              )}
              {verdictResult.warnings.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-current/10 pt-2">
                  {verdictResult.warnings.map((w) => (
                    <p key={w} className="flex items-start gap-1.5 text-xs"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>
                  ))}
                </div>
              )}
              {verdictResult.verdict === "AVERAGE DOWN" && (
                <div className="mt-3 border-t border-emerald-500/20 pt-3">
                  <p className="text-[11px] font-medium">Suggested sizing: Initial 30% → Add 1: 30% → Add 2: 20% → Reserve 20%</p>
                </div>
              )}
            </div>

            {/* Reset */}
            <button type="button"
              onClick={() => setThesisMap((p) => { const n = { ...p }; delete n[selected]; return n; })}
              className="text-[11px] text-subtle hover:text-muted">
              Reset thesis for {selected}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

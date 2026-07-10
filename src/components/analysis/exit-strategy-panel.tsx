"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Gauge,
  HelpCircle,
  LineChart,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { StockAvatar } from "@/components/ui/stock-avatar";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import type { CombinedAnalysisRow } from "@/lib/analysis/combined-analysis";
import type {
  SectorAnalysisResult,
  SectorRollup,
} from "@/lib/analysis/sector-analysis";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";

// ─── types ────────────────────────────────────────────────────────────────────

type ThesisAnswer = "intact" | "uncertain" | "broken";
// sell = strong exit signal · trim = partial · hold = keep · unknown = no data
type FactorStatus = "sell" | "trim" | "hold" | "unknown";

interface Factor {
  status: FactorStatus;
  label: string;
  reason: string;
  bullets?: string[];
  /** Fraction of the position this factor argues for selling (0–1). */
  sellFraction: number;
}

// Extra live data fetched per selected symbol (trailing-stop peak + RSI).
interface StockExtra {
  high52wK: number | null;
  rsi: number | null;
  priceK: number | null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtVnd(priceK: number | null | undefined): string {
  if (priceK == null || priceK <= 0) return "—";
  return `${Math.round(priceK * 1000).toLocaleString("vi-VN")} ₫`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Growth-fair P/E: base 14 lifted by growth, capped 10–25 (matches stock-detail fair-value logic). */
function fairPeFromGrowth(growthPct: number): number {
  return clamp(14 + growthPct * 0.4, 10, 25);
}

/** Average peer P/E from the stock's sector rollup (needs ≥2 sane data points). */
function peerAvgPe(rollup: SectorRollup | undefined): number | null {
  if (!rollup) return null;
  const pes = rollup.stocks
    .filter((s) => s.peRatio != null && s.peRatio > 2 && s.peRatio < 80)
    .map((s) => s.peRatio as number);
  if (pes.length < 2) return null;
  return pes.reduce((a, b) => a + b, 0) / pes.length;
}

function defaultTargetPct(h: EnrichedHolding): number {
  if (
    h.targetLongTerm != null &&
    h.avgBuyPrice > 0 &&
    h.targetLongTerm > h.avgBuyPrice
  ) {
    return Math.round(clamp((h.targetLongTerm / h.avgBuyPrice - 1) * 100, 10, 300));
  }
  return 30;
}

// ─── factor 1: overvaluation ──────────────────────────────────────────────────

function analyzeValuation(
  fundRow: FundamentalAnalysisRow | undefined,
  rollup: SectorRollup | undefined,
  isEtf: boolean,
): Factor {
  if (isEtf) {
    return {
      status: "hold",
      label: "N/A — ETF",
      reason:
        "ETFs track an index and have no company P/E — valuation-based selling doesn't apply. Judge on trend and portfolio fit instead.",
      sellFraction: 0,
    };
  }
  if (!fundRow || fundRow.pe == null || fundRow.pe <= 0) {
    return {
      status: "unknown",
      label: "No P/E data",
      reason: "No valid P/E available — review valuation manually.",
      sellFraction: 0,
    };
  }
  const pe = fundRow.pe;
  const growthPct =
    fundRow.revenueGrowth ??
    (fundRow.breakdown.growthScore / 25) * 30; // proxy 0–30%
  const growthAccelerating = growthPct >= 18;
  const fairPe = fairPeFromGrowth(growthPct);
  const peerPe = peerAvgPe(rollup);

  const bullets: string[] = [
    `P/E ${pe.toFixed(1)}× · growth-fair P/E ≈ ${fairPe.toFixed(1)}×`,
  ];
  if (peerPe != null) bullets.push(`Sector avg P/E ${peerPe.toFixed(1)}×`);
  bullets.push(
    `Growth ${growthPct.toFixed(0)}% — ${growthAccelerating ? "still accelerating" : "not accelerating enough to justify a re-rating"}`,
  );

  const overFairPct = (pe / fairPe - 1) * 100;
  const overPeerPct = peerPe != null ? (pe / peerPe - 1) * 100 : null;

  const richVsPeer = overPeerPct != null && overPeerPct >= 30;
  const richVsFair = overFairPct >= 35;
  const mildVsPeer = overPeerPct != null && overPeerPct >= 12;
  const mildVsFair = overFairPct >= 15;

  if (!growthAccelerating && (richVsPeer || richVsFair)) {
    return {
      status: "sell",
      label: "Overvalued",
      reason: `P/E ${pe.toFixed(1)}× is ${overPeerPct != null ? `${overPeerPct.toFixed(0)}% above the sector average` : `${overFairPct.toFixed(0)}% above growth-fair value`} while growth is not accelerating. The market looks overly optimistic — take profits on valuation, not just price.`,
      bullets,
      sellFraction: 0.4,
    };
  }
  if (mildVsPeer || mildVsFair) {
    return {
      status: "trim",
      label: "Getting expensive",
      reason: `P/E ${pe.toFixed(1)}× is running ahead of ${overPeerPct != null ? "peers" : "growth-fair value"}. Not extreme yet — consider trimming if the premium keeps expanding.`,
      bullets,
      sellFraction: 0.15,
    };
  }
  return {
    status: "hold",
    label: "Reasonably valued",
    reason: `P/E ${pe.toFixed(1)}× is in line with growth-fair value${peerPe != null ? " and peers" : ""}. Valuation is not a reason to sell.`,
    bullets,
    sellFraction: 0,
  };
}

// ─── factor 2: thesis / fundamental deterioration ─────────────────────────────

function analyzeThesis(
  thesis: ThesisAnswer,
  fundRow: FundamentalAnalysisRow | undefined,
  combinedRow: CombinedAnalysisRow | undefined,
  isEtf: boolean,
): Factor {
  // Broken thesis is a hard exit regardless of asset type.
  if (thesis === "broken") {
    return {
      status: "sell",
      label: "Thesis broken",
      reason:
        "The original reasons for owning this no longer hold. Sell even at a loss — this is one of the most important selling principles.",
      sellFraction: 1,
    };
  }

  // ETFs track an index — there is no company-level fundamental thesis to break.
  if (isEtf) {
    if (thesis === "uncertain") {
      return {
        status: "trim",
        label: "Uncertain",
        reason:
          "ETF tracks an index, so there's no company thesis — but you're unsure it still fits your allocation. Trim to reduce exposure.",
        sellFraction: 0.15,
      };
    }
    return {
      status: "hold",
      label: "Index exposure intact",
      reason:
        "ETF tracks an index — no company-specific thesis to break. Keep it as long as it still fits your allocation.",
      sellFraction: 0,
    };
  }

  const flags: string[] = [];
  if (fundRow) {
    const { finalScore, growthScore, stabilityScore } = fundRow.breakdown;
    if (fundRow.revenueGrowth != null && fundRow.revenueGrowth < 0)
      flags.push(`Revenue declining (${fundRow.revenueGrowth.toFixed(0)}%)`);
    if (fundRow.roe != null && fundRow.roe < 8)
      flags.push(`ROE weak (${fundRow.roe.toFixed(1)}%)`);
    if (finalScore > 0 && finalScore < 45)
      flags.push(`Fundamental score low (${finalScore}/100)`);
    if (growthScore > 0 && growthScore < 8)
      flags.push(`Earnings growth stalled (${growthScore}/25)`);
    if (stabilityScore > 0 && stabilityScore < 10)
      flags.push(`Balance-sheet / debt concern (stability ${stabilityScore}/25)`);
  }
  const rec = (combinedRow?.recommendation ?? "").toUpperCase();
  if (rec.includes("SELL") || rec.includes("AVOID"))
    flags.push(`Model signal: ${combinedRow?.recommendation}`);

  // No usable snapshot (all-zero breakdown) → don't fabricate deterioration.
  const hasFundData =
    !!fundRow &&
    (fundRow.breakdown.finalScore > 0 ||
      fundRow.roe != null ||
      fundRow.revenueGrowth != null);
  if (!hasFundData && flags.length === 0) {
    return {
      status: "unknown",
      label: "No fundamental data",
      reason:
        "No fundamental snapshot available for this holding — review the thesis manually.",
      sellFraction: 0,
    };
  }

  if (flags.length >= 2 || (hasFundData && fundRow!.breakdown.finalScore > 0 && fundRow!.breakdown.finalScore < 40)) {
    return {
      status: "sell",
      label: "Deteriorating",
      reason:
        "Multiple fundamentals are weakening. Revisit your thesis — if the growth story is gone, exit rather than hope.",
      bullets: flags,
      sellFraction: 0.45,
    };
  }
  if (thesis === "uncertain" || flags.length === 1) {
    return {
      status: "trim",
      label: "Watch closely",
      reason:
        thesis === "uncertain"
          ? "You are unsure the thesis still holds — trim to reduce risk until it re-confirms."
          : "One warning sign present. Not broken yet, but monitor the next earnings report.",
      bullets: flags,
      sellFraction: 0.15,
    };
  }
  return {
    status: "hold",
    label: "Thesis intact",
    reason:
      "The business is still doing what you bought it for. A rising price alone is not a reason to sell.",
    sellFraction: 0,
  };
}

// ─── factor 3: predefined profit target ───────────────────────────────────────

function analyzeProfitTarget(
  gainPct: number | null,
  targetPct: number,
): Factor {
  if (gainPct == null) {
    return {
      status: "unknown",
      label: "No price data",
      reason: "Current price unavailable — cannot measure progress to target.",
      sellFraction: 0,
    };
  }
  const progress = targetPct > 0 ? (gainPct / targetPct) * 100 : 0;
  const bullets = [
    `Current gain ${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% · target +${targetPct}%`,
    `${clamp(progress, 0, 999).toFixed(0)}% of the way to target`,
  ];
  if (gainPct >= targetPct) {
    return {
      status: "trim",
      label: "Target reached",
      reason: `You are up ${gainPct.toFixed(1)}% vs a +${targetPct}% target. Consider selling 30–50% to recover your initial capital and lock in gains, letting the rest run.`,
      bullets,
      sellFraction: 0.35,
    };
  }
  if (gainPct >= targetPct * 0.8) {
    return {
      status: "hold",
      label: "Near target",
      reason: `Up ${gainPct.toFixed(1)}% — approaching your +${targetPct}% target. Decide your scale-out plan now.`,
      bullets,
      sellFraction: 0,
    };
  }
  return {
    status: "hold",
    label: "Below target",
    reason: `Up ${gainPct.toFixed(1)}% vs +${targetPct}% target. No profit-taking trigger yet.`,
    bullets,
    sellFraction: 0,
  };
}

// ─── factor 4: trailing stop (momentum) ───────────────────────────────────────

function analyzeTrailingStop(
  currentPriceK: number | null,
  peakK: number | null,
  trailPct: number,
  gainPct: number | null,
): Factor {
  if (currentPriceK == null || peakK == null || peakK <= 0) {
    return {
      status: "unknown",
      label: "No peak data",
      reason:
        "Set a peak price (defaults to the 52-week high) to evaluate a trailing stop.",
      sellFraction: 0,
    };
  }
  const stopK = peakK * (1 - trailPct / 100);
  const fromPeakPct = (currentPriceK / peakK - 1) * 100;
  const bullets = [
    `Peak ${fmtVnd(peakK)} · stop ${fmtVnd(stopK)} (−${trailPct}%)`,
    `Current ${fmtVnd(currentPriceK)} · ${fromPeakPct >= 0 ? "+" : ""}${fromPeakPct.toFixed(1)}% from peak`,
  ];
  if (currentPriceK <= stopK) {
    return {
      status: "sell",
      label: "Stop triggered",
      reason: `Price has fallen ${Math.abs(fromPeakPct).toFixed(1)}% from its ${fmtVnd(peakK)} peak, past your ${trailPct}% trailing stop. Momentum rule says protect profits and exit.`,
      bullets,
      sellFraction: (gainPct ?? 0) > 0 ? 0.5 : 0.4,
    };
  }
  const room = ((currentPriceK - stopK) / currentPriceK) * 100;
  return {
    status: "hold",
    label: "Above stop",
    reason: `Price is ${room.toFixed(1)}% above the ${trailPct}% trailing stop (${fmtVnd(stopK)}). Stay invested while the uptrend holds.`,
    bullets,
    sellFraction: 0,
  };
}

// ─── factor 5: concentration / rebalance ──────────────────────────────────────

const TRIM_TARGET_WEIGHT = 18; // trim back toward this % on over-concentration

function analyzeConcentration(
  weightPct: number | null,
  currentValueK: number | null,
  currentPriceK: number | null,
  totalValueK: number,
): Factor & { sharesToTrim: number | null } {
  if (weightPct == null || currentValueK == null || currentPriceK == null) {
    return {
      status: "unknown",
      label: "No weight data",
      reason: "Position weight unavailable — current price missing.",
      sellFraction: 0,
      sharesToTrim: null,
    };
  }
  const bullets = [`Position is ${weightPct.toFixed(1)}% of portfolio (soft cap 20% · hard cap 25%)`];
  if (weightPct > 25) {
    const targetValueK = (TRIM_TARGET_WEIGHT / 100) * totalValueK;
    const trimValueK = Math.max(0, currentValueK - targetValueK);
    const sharesToTrim = currentPriceK > 0 ? trimValueK / currentPriceK : null;
    return {
      status: "trim",
      label: `Over-concentrated ${weightPct.toFixed(1)}%`,
      reason: `This one stock is ${weightPct.toFixed(1)}% of the portfolio — above the 25% cap. Rebalancing back to ~${TRIM_TARGET_WEIGHT}% lowers single-stock risk.`,
      bullets,
      sellFraction: (weightPct - TRIM_TARGET_WEIGHT) / weightPct,
      sharesToTrim,
    };
  }
  if (weightPct > 20) {
    return {
      status: "trim",
      label: `Heavy ${weightPct.toFixed(1)}%`,
      reason: `At ${weightPct.toFixed(1)}% this position is above the 20% soft cap. Consider trimming toward 15–20%.`,
      bullets,
      sellFraction: 0.15,
      sharesToTrim: null,
    };
  }
  return {
    status: "hold",
    label: `Balanced ${weightPct.toFixed(1)}%`,
    reason: `${weightPct.toFixed(1)}% weight is within the 20% guideline. No rebalancing needed.`,
    bullets,
    sellFraction: 0,
    sharesToTrim: null,
  };
}

// ─── factor 6: better opportunity (capital rotation) ──────────────────────────

function analyzeOpportunity(
  symbol: string,
  combinedRows: CombinedAnalysisRow[] | undefined,
  fundRow: FundamentalAnalysisRow | undefined,
  upsidePct: number | null,
  isEtf: boolean,
): Factor {
  if (isEtf) {
    return {
      status: "hold",
      label: "N/A — ETF",
      reason:
        "ETF combined score is technical-only and not comparable to single stocks — opportunity-cost rotation doesn't apply cleanly.",
      sellFraction: 0,
    };
  }
  const rows = combinedRows ?? [];
  const thisRow = rows.find(
    (r) => r.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  const thisScore = thisRow?.combinedScore ?? fundRow?.breakdown.finalScore ?? null;
  if (thisScore == null || rows.length < 2) {
    return {
      status: "unknown",
      label: "No comparison",
      reason: "Not enough portfolio holdings to compare opportunity cost.",
      sellFraction: 0,
    };
  }
  const others = rows.filter(
    (r) => r.symbol.toUpperCase() !== symbol.toUpperCase() && !r.isEtf,
  );
  if (!others.length) {
    return {
      status: "hold",
      label: "No comparison",
      reason: "No comparable single-stock holdings to rotate into.",
      sellFraction: 0,
    };
  }
  const best = others.reduce(
    (m, r) => (r.combinedScore > m.combinedScore ? r : m),
    others[0],
  );
  const gap = best.combinedScore - thisScore;
  const bullets = [
    `This stock score ${thisScore} · best alternative ${best.symbol} ${best.combinedScore}`,
  ];
  if (upsidePct != null)
    bullets.push(`Remaining upside to your target ≈ ${upsidePct.toFixed(0)}%`);

  // Only a real opportunity-cost signal when this holding is genuinely weak AND
  // a clearly better option exists. A good business is not sold just because
  // something else scored a little higher.
  if (gap >= 25 && thisScore < 45) {
    return {
      status: "trim",
      label: "Weak vs alternatives",
      reason: `This holding scores only ${thisScore} while ${best.symbol} scores ${gap} points higher. Capital may work harder elsewhere — consider rotating a portion.`,
      bullets,
      sellFraction: 0.15,
    };
  }
  return {
    status: "hold",
    label: "No clear upgrade",
    reason: `Combined score ${thisScore} — no clearly superior holding to rotate into right now.`,
    bullets,
    sellFraction: 0,
  };
}

// ─── verdict ──────────────────────────────────────────────────────────────────

type ExitAction =
  | "HOLD"
  | "CONSIDER TRIMMING"
  | "TAKE PARTIAL PROFITS"
  | "TRIM SUBSTANTIALLY"
  | "SELL / EXIT";

interface VerdictResult {
  action: ExitAction;
  sellFraction: number;
  sharesToSell: number | null;
  proceedsK: number | null;
  reasons: string[];
}

function computeVerdict(
  factors: {
    valuation: Factor;
    thesis: Factor;
    profit: Factor;
    trailing: Factor;
    concentration: Factor & { sharesToTrim: number | null };
    opportunity: Factor;
  },
  holding: EnrichedHolding | undefined,
): VerdictResult {
  const reasons: string[] = [];

  // Hard exit: broken thesis overrides everything.
  if (factors.thesis.status === "sell" && factors.thesis.sellFraction >= 1) {
    reasons.push(factors.thesis.reason);
    const shares = holding?.shares ?? null;
    return {
      action: "SELL / EXIT",
      sellFraction: 1,
      sharesToSell: shares,
      proceedsK:
        shares != null && holding?.currentPriceK != null
          ? shares * holding.currentPriceK
          : null,
      reasons,
    };
  }

  // The strongest single factor drives the decision; a second independent
  // sell signal adds a modest bump. A good, reasonably-valued holding fires
  // nothing → HOLD stays the default.
  const allFactors = [
    factors.valuation,
    factors.thesis,
    factors.profit,
    factors.trailing,
    factors.concentration,
    factors.opportunity,
  ];
  const maxFraction = allFactors.reduce((m, f) => Math.max(m, f.sellFraction), 0);
  const strongSignals = allFactors.filter((f) => f.status === "sell" && f.sellFraction >= 0.3).length;
  let fraction = maxFraction + (strongSignals >= 2 ? 0.15 : 0);
  fraction = clamp(fraction, 0, 1);

  let action: ExitAction;
  if (fraction >= 0.85) action = "SELL / EXIT";
  else if (fraction >= 0.55) action = "TRIM SUBSTANTIALLY";
  else if (fraction >= 0.35) action = "TAKE PARTIAL PROFITS";
  else if (fraction >= 0.2) action = "CONSIDER TRIMMING";
  else action = "HOLD";

  if (action === "HOLD") {
    reasons.push(
      "No exit trigger fired. If the business is intact and reasonably valued, a higher price alone is not a reason to sell.",
    );
  } else {
    // Surface only the factors that actually drove the decision.
    for (const f of allFactors) {
      if ((f.status === "sell" || f.status === "trim") && f.sellFraction >= 0.15) {
        reasons.push(`${f.label}: ${f.reason}`);
      }
    }
  }

  const shares = holding?.shares ?? null;
  const sharesToSell =
    shares != null && fraction > 0 ? Math.round(shares * fraction) : shares != null ? 0 : null;
  const proceedsK =
    sharesToSell != null && holding?.currentPriceK != null
      ? sharesToSell * holding.currentPriceK
      : null;

  return { action, sellFraction: fraction, sharesToSell, proceedsK, reasons };
}

/** Lightweight verdict for the holdings list (no live peak / trailing stop). */
function quickAction(
  h: EnrichedHolding,
  fundRow: FundamentalAnalysisRow | undefined,
  combinedRow: CombinedAnalysisRow | undefined,
  rollup: SectorRollup | undefined,
  combinedRows: CombinedAnalysisRow[] | undefined,
  totalValueK: number,
): ExitAction {
  const weightPct =
    totalValueK > 0 && h.currentValueK != null
      ? (h.currentValueK / totalValueK) * 100
      : null;
  const upsidePct =
    h.targetLongTerm != null && h.currentPriceK != null && h.currentPriceK > 0
      ? (h.targetLongTerm / h.currentPriceK - 1) * 100
      : null;
  const isEtf = fundRow?.isEtf ?? combinedRow?.isEtf ?? isEtfSymbol(h.symbol);
  const verdict = computeVerdict(
    {
      valuation: analyzeValuation(fundRow, rollup, isEtf),
      thesis: analyzeThesis("intact", fundRow, combinedRow, isEtf),
      profit: analyzeProfitTarget(h.gainPct ?? null, defaultTargetPct(h)),
      trailing: analyzeTrailingStop(null, null, 12, h.gainPct ?? null),
      concentration: analyzeConcentration(
        weightPct,
        h.currentValueK ?? null,
        h.currentPriceK ?? null,
        totalValueK,
      ),
      opportunity: analyzeOpportunity(h.symbol, combinedRows, fundRow, upsidePct, isEtf),
    },
    h,
  );
  return verdict.action;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: FactorStatus }) {
  if (status === "hold") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (status === "trim") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
  if (status === "sell") return <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />;
  return <HelpCircle className="h-3.5 w-3.5 shrink-0 text-subtle" />;
}

function statusBorderBg(status: FactorStatus) {
  if (status === "hold") return "border-emerald-500/25 bg-emerald-500/8";
  if (status === "trim") return "border-amber-500/25 bg-amber-500/8";
  if (status === "sell") return "border-red-500/25 bg-red-500/8";
  return "border-[var(--border)] bg-[var(--bg-secondary)]";
}

function statusTextColor(status: FactorStatus) {
  if (status === "hold") return "text-emerald-700 dark:text-emerald-300";
  if (status === "trim") return "text-amber-700 dark:text-amber-300";
  if (status === "sell") return "text-red-700 dark:text-red-300";
  return "text-subtle";
}

function FactorCard({
  step,
  title,
  icon,
  factor,
  children,
}: {
  step: number;
  title: string;
  icon: React.ReactNode;
  factor: Factor;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${statusBorderBg(factor.status)}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
            {step}
          </span>
          <span className="text-muted">{icon}</span>
          <p className="text-sm font-semibold text-[var(--fg)]">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusIcon status={factor.status} />
          <span className={`text-xs font-semibold ${statusTextColor(factor.status)}`}>
            {factor.label}
          </span>
        </div>
      </div>
      {factor.bullets && factor.bullets.length > 0 && (
        <ul className="mb-1.5 space-y-0.5">
          {factor.bullets.map((b) => (
            <li key={b} className="flex items-start gap-1.5 text-[11px] text-muted">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
              {b}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{factor.reason}</p>
      {children}
    </div>
  );
}

const actionStyle: Record<ExitAction, string> = {
  "SELL / EXIT": "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200",
  "TRIM SUBSTANTIALLY": "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200",
  "TAKE PARTIAL PROFITS": "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  "CONSIDER TRIMMING": "border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-200",
  HOLD: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
};

const actionIcon: Record<ExitAction, React.ReactNode> = {
  "SELL / EXIT": <XCircle className="h-5 w-5 text-red-500" />,
  "TRIM SUBSTANTIALLY": <TrendingDown className="h-5 w-5 text-orange-500" />,
  "TAKE PARTIAL PROFITS": <Scale className="h-5 w-5 text-amber-500" />,
  "CONSIDER TRIMMING": <AlertTriangle className="h-5 w-5 text-amber-500" />,
  HOLD: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
};

function actionBadgeClass(action: ExitAction): string {
  if (action === "SELL / EXIT") return "bg-red-500/15 text-red-600 dark:text-red-300 ring-red-500/30";
  if (action === "TRIM SUBSTANTIALLY") return "bg-orange-500/15 text-orange-600 dark:text-orange-300 ring-orange-500/30";
  if (action === "TAKE PARTIAL PROFITS" || action === "CONSIDER TRIMMING")
    return "bg-amber-500/15 text-amber-600 dark:text-amber-300 ring-amber-500/30";
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30";
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function ExitStrategyPanel({
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
  // Biggest winners first — those are where exit discipline matters most.
  const sorted = useMemo(
    () => [...holdings].sort((a, b) => (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity)),
    [holdings],
  );

  const [selected, setSelected] = useState<string | null>(() => sorted[0]?.symbol ?? null);
  const [thesisMap, setThesisMap] = useState<Record<string, ThesisAnswer>>({});
  const [targetMap, setTargetMap] = useState<Record<string, number>>({});
  const [trailMap, setTrailMap] = useState<Record<string, number>>({});
  const [peakMap, setPeakMap] = useState<Record<string, number>>({});
  const [extras, setExtras] = useState<Record<string, StockExtra>>({});
  const [guideOpen, setGuideOpen] = useState(false);
  const fetchedRef = useRef<Set<string>>(new Set());

  const totalValueK = holdings.reduce(
    (sum, h) => sum + (h.currentValueK ?? h.costBasis),
    0,
  );

  const rollupFor = useCallback(
    (symbol: string | null, sector: string | null | undefined): SectorRollup | undefined => {
      if (!symbol || !sectorAnalysis) return undefined;
      return (
        sectorAnalysis.sectors.find((s) => s.stocks.some((st) => st.symbol === symbol)) ??
        sectorAnalysis.sectors.find((s) =>
          s.name.toLowerCase().includes((sector ?? "").toLowerCase().split(" ")[0]),
        )
      );
    },
    [sectorAnalysis],
  );

  // Fetch live 52-week high + RSI for the selected symbol (trailing-stop peak).
  useEffect(() => {
    if (!selected || fetchedRef.current.has(selected)) return;
    fetchedRef.current.add(selected);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stocks/${selected}?lite=true`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          stock: { high52w?: number; rsi?: number; price?: number };
        };
        if (cancelled) return;
        const s = data.stock ?? {};
        setExtras((p) => ({
          ...p,
          [selected]: {
            high52wK: s.high52w && s.high52w > 0 ? s.high52w / 1000 : null,
            rsi: s.rsi ?? null,
            priceK: s.price && s.price > 0 ? s.price / 1000 : null,
          },
        }));
      } catch {
        fetchedRef.current.delete(selected);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const holding = holdings.find((h) => h.symbol === selected);
  const fundRow = fundamentalRows.find(
    (r) => r.symbol.toUpperCase() === selected?.toUpperCase(),
  );
  const combinedRow = combinedRows?.find(
    (r) => r.symbol.toUpperCase() === selected?.toUpperCase(),
  );
  const rollup = rollupFor(selected, holding?.sector);

  const weightPct =
    totalValueK > 0 && holding?.currentValueK != null
      ? (holding.currentValueK / totalValueK) * 100
      : null;

  const targetPct = selected
    ? targetMap[selected] ?? (holding ? defaultTargetPct(holding) : 30)
    : 30;
  const trailPct = selected ? trailMap[selected] ?? 12 : 12;
  const extra = selected ? extras[selected] : undefined;
  const peakK = selected
    ? peakMap[selected] ?? extra?.high52wK ?? holding?.currentPriceK ?? null
    : null;

  const upsidePct =
    holding?.targetLongTerm != null &&
    holding.currentPriceK != null &&
    holding.currentPriceK > 0
      ? (holding.targetLongTerm / holding.currentPriceK - 1) * 100
      : null;

  const thesis: ThesisAnswer = selected ? thesisMap[selected] ?? "intact" : "intact";
  const isEtf = fundRow?.isEtf ?? combinedRow?.isEtf ?? (selected ? isEtfSymbol(selected) : false);

  const valuation = useMemo(() => analyzeValuation(fundRow, rollup, isEtf), [fundRow, rollup, isEtf]);
  const thesisFactor = useMemo(
    () => analyzeThesis(thesis, fundRow, combinedRow, isEtf),
    [thesis, fundRow, combinedRow, isEtf],
  );
  const profit = useMemo(
    () => analyzeProfitTarget(holding?.gainPct ?? null, targetPct),
    [holding?.gainPct, targetPct],
  );
  const trailing = useMemo(
    () => analyzeTrailingStop(holding?.currentPriceK ?? null, peakK, trailPct, holding?.gainPct ?? null),
    [holding?.currentPriceK, peakK, trailPct, holding?.gainPct],
  );
  const concentration = useMemo(
    () =>
      analyzeConcentration(
        weightPct,
        holding?.currentValueK ?? null,
        holding?.currentPriceK ?? null,
        totalValueK,
      ),
    [weightPct, holding?.currentValueK, holding?.currentPriceK, totalValueK],
  );
  const opportunity = useMemo(
    () => analyzeOpportunity(selected ?? "", combinedRows, fundRow, upsidePct, isEtf),
    [selected, combinedRows, fundRow, upsidePct, isEtf],
  );

  const verdict = useMemo(
    () =>
      computeVerdict(
        { valuation, thesis: thesisFactor, profit, trailing, concentration, opportunity },
        holding,
      ),
    [valuation, thesisFactor, profit, trailing, concentration, opportunity, holding],
  );

  const listActions = useMemo(() => {
    const map: Record<string, ExitAction> = {};
    for (const h of sorted) {
      const fRow = fundamentalRows.find((r) => r.symbol.toUpperCase() === h.symbol.toUpperCase());
      const cRow = combinedRows?.find((r) => r.symbol.toUpperCase() === h.symbol.toUpperCase());
      map[h.symbol] = quickAction(h, fRow, cRow, rollupFor(h.symbol, h.sector), combinedRows, totalValueK);
    }
    return map;
  }, [sorted, fundamentalRows, combinedRows, rollupFor, totalValueK]);

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1px_1fr]">
      {/* Left — holding list */}
      <div className="space-y-1.5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-[var(--fg)]">Holdings</p>
          <p className="text-[11px] text-muted">Sorted: biggest gain first</p>
        </div>
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No holdings found.</p>
        ) : (
          sorted.map((h) => {
            const wt =
              totalValueK > 0 && h.currentValueK != null
                ? (h.currentValueK / totalValueK) * 100
                : null;
            const action = listActions[h.symbol];
            return (
              <button
                key={h.symbol}
                type="button"
                onClick={() => setSelected((p) => (p === h.symbol ? null : h.symbol))}
                className={`w-full rounded-xl px-3 py-2.5 text-left ring-1 transition-all ${
                  selected === h.symbol
                    ? "bg-[var(--accent-bg)] ring-accent/40"
                    : "bg-[var(--bg-secondary)] ring-[var(--border)] hover:bg-[var(--card)] hover:ring-accent/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <StockAvatar symbol={h.symbol} sector={h.sector ?? undefined} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/stocks/${h.symbol}`}
                          className="text-sm font-semibold text-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {h.symbol}
                        </Link>
                        {h.gainPct != null && h.gainPct > 0 && (
                          <TrendingUp className="h-3 w-3 shrink-0 text-emerald-500" />
                        )}
                        {h.gainPct != null && h.gainPct < 0 && (
                          <TrendingDown className="h-3 w-3 shrink-0 text-red-500" />
                        )}
                      </div>
                      <div className="truncate text-[10px] text-subtle">{h.sector ?? "Unknown"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {h.gainPct != null ? (
                      <span
                        className={`font-mono text-xs font-semibold ${h.gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}
                      >
                        {h.gainPct >= 0 ? "+" : ""}
                        {h.gainPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-subtle">—</span>
                    )}
                    {wt != null && <div className="text-[10px] text-subtle">{wt.toFixed(1)}% wt</div>}
                    {action && (
                      <div
                        className={`mt-0.5 inline-block rounded px-1 text-[9px] font-bold ring-1 ${actionBadgeClass(action)}`}
                      >
                        {action === "SELL / EXIT"
                          ? "SELL"
                          : action === "TRIM SUBSTANTIALLY"
                            ? "TRIM"
                            : action === "TAKE PARTIAL PROFITS"
                              ? "PARTIAL"
                              : action === "CONSIDER TRIMMING"
                                ? "WATCH"
                                : "HOLD"}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Divider */}
      <div className="hidden bg-[var(--border)] lg:block" />

      {/* Right — analysis */}
      <div>
        {!selected || !holding ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <LineChart className="mb-3 h-10 w-10 text-subtle" />
            <p className="text-sm font-semibold text-[var(--fg)]">Exit Strategy Analyzer</p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Select a holding to run the 6-factor sell framework. Valuation, thesis, profit target,
              trailing stop, concentration, and opportunity cost are computed from your data.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Stock header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/stocks/${holding.symbol}`} className="text-base font-bold text-accent hover:underline">
                    {holding.symbol}
                  </Link>
                  {holding.name && <span className="text-xs text-muted">{holding.name}</span>}
                </div>
                <p className="text-[11px] text-subtle">{holding.sector}</p>
              </div>
              <div className="text-right">
                {holding.currentPriceK != null && (
                  <p className="font-mono text-sm font-semibold text-[var(--fg)]">
                    {fmtVnd(holding.currentPriceK)}
                  </p>
                )}
                {holding.gainPct != null && (
                  <p
                    className={`font-mono text-xs font-semibold ${holding.gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}
                  >
                    {holding.gainPct >= 0 ? "+" : ""}
                    {holding.gainPct.toFixed(2)}% from avg cost
                  </p>
                )}
              </div>
            </div>

            {/* Price / position strip */}
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Avg Buy</p>
                <p className="font-mono text-xs font-semibold text-[var(--fg)]">{fmtVnd(holding.avgBuyPrice)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Current</p>
                <p
                  className={`font-mono text-xs font-semibold ${holding.gainPct != null && holding.gainPct < 0 ? "text-red-500" : "text-emerald-500"}`}
                >
                  {fmtVnd(holding.currentPriceK)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Weight</p>
                <p className="font-mono text-xs font-semibold text-[var(--fg)]">
                  {weightPct != null ? `${weightPct.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">RSI</p>
                <p className="font-mono text-xs font-semibold text-[var(--fg)]">
                  {extra?.rsi != null ? extra.rsi.toFixed(0) : "—"}
                </p>
              </div>
            </div>

            {/* Interactive inputs */}
            <div className="grid gap-3 rounded-xl bg-[var(--bg-secondary)] p-3.5 ring-1 ring-[var(--border)] sm:grid-cols-2">
              {/* Thesis */}
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-semibold text-[var(--fg)]">
                  Is your investment thesis still valid?
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: "intact", label: "✅ Still valid", color: "emerald" },
                      { v: "uncertain", label: "⚠️ Uncertain", color: "amber" },
                      { v: "broken", label: "❌ Broken", color: "red" },
                    ] as const
                  ).map(({ v, label, color }) => {
                    const active = thesis === v;
                    const cls =
                      color === "emerald"
                        ? active
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40"
                          : "text-muted ring-[var(--border)] hover:bg-emerald-500/10"
                        : color === "amber"
                          ? active
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/40"
                            : "text-muted ring-[var(--border)] hover:bg-amber-500/10"
                          : active
                            ? "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/40"
                            : "text-muted ring-[var(--border)] hover:bg-red-500/10";
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setThesisMap((p) => ({ ...p, [selected]: v }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-all ${cls}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Profit target */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[var(--fg)]">
                  Profit target (+%)
                </label>
                <input
                  type="number"
                  min={1}
                  value={targetPct}
                  onChange={(e) =>
                    setTargetMap((p) => ({ ...p, [selected]: Math.max(1, Number(e.target.value) || 0) }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg,var(--card))] px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>

              {/* Trailing stop */}
              <div>
                <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg)]">
                  <span>Trailing stop</span>
                  <span className="font-mono text-accent">{trailPct}%</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={trailPct}
                  onChange={(e) => setTrailMap((p) => ({ ...p, [selected]: Number(e.target.value) }))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              {/* Peak price */}
              <div className="sm:col-span-2">
                <label className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--fg)]">
                  <span>Peak price (for trailing stop)</span>
                  <span className="text-[10px] font-normal text-subtle">
                    {extra?.high52wK != null ? `52w high ${fmtVnd(extra.high52wK)}` : "loading 52w high…"}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={peakK != null ? Number(peakK.toFixed(2)) : ""}
                  onChange={(e) => setPeakMap((p) => ({ ...p, [selected]: Number(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg,var(--card))] px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <p className="mt-1 text-[10px] text-subtle">Value in thousands (K) ₫ — matches your avg-buy units.</p>
              </div>
            </div>

            {/* Factor cards */}
            <FactorCard step={1} title="Overvaluation" icon={<Gauge className="h-4 w-4" />} factor={valuation} />
            <FactorCard step={2} title="Investment Thesis" icon={<Target className="h-4 w-4" />} factor={thesisFactor} />
            <FactorCard step={3} title="Profit Target" icon={<TrendingUp className="h-4 w-4" />} factor={profit} />
            <FactorCard step={4} title="Trailing Stop (momentum)" icon={<TrendingDown className="h-4 w-4" />} factor={trailing} />
            <FactorCard step={5} title="Concentration / Rebalance" icon={<Scale className="h-4 w-4" />} factor={concentration} />
            <FactorCard step={6} title="Better Opportunity" icon={<LineChart className="h-4 w-4" />} factor={opportunity} />

            {/* Verdict */}
            <div className={`rounded-xl border p-4 ${actionStyle[verdict.action]}`}>
              <div className="flex items-center gap-2.5">
                {actionIcon[verdict.action]}
                <div>
                  <p className="text-base font-bold">{verdict.action}</p>
                  {verdict.sellFraction > 0 && (
                    <p className="text-[11px] opacity-80">
                      Suggested exit: ~{Math.round(verdict.sellFraction * 100)}% of the position
                      {verdict.sharesToSell != null && verdict.sharesToSell > 0
                        ? ` · ${verdict.sharesToSell.toLocaleString("vi-VN")} shares`
                        : ""}
                      {verdict.proceedsK != null && verdict.proceedsK > 0
                        ? ` ≈ ${fmtVnd(verdict.proceedsK)}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
              {verdict.reasons.length > 0 && (
                <ul className="mt-2 ml-1 space-y-1">
                  {verdict.reasons.map((r) => (
                    <li key={r} className="flex items-start gap-1.5 text-xs">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 border-t border-current/10 pt-2 text-[11px] opacity-80">
                Sell because valuation is stretched, the thesis broke, or risk needs trimming — not
                simply because the price went up. If the business keeps growing and stays reasonably
                valued, holding longer often wins.
              </p>
            </div>

            {/* Reset */}
            <button
              type="button"
              onClick={() => {
                setThesisMap((p) => {
                  const n = { ...p };
                  delete n[selected];
                  return n;
                });
                setTargetMap((p) => {
                  const n = { ...p };
                  delete n[selected];
                  return n;
                });
                setTrailMap((p) => {
                  const n = { ...p };
                  delete n[selected];
                  return n;
                });
                setPeakMap((p) => {
                  const n = { ...p };
                  delete n[selected];
                  return n;
                });
              }}
              className="text-[11px] text-subtle hover:text-muted"
            >
              Reset inputs for {selected}
            </button>
          </div>
        )}

        {/* Selling framework guide */}
        <div className="mt-4 rounded-lg border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setGuideOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-xs font-semibold text-[var(--fg)] hover:bg-[var(--bg-secondary)]"
          >
            <span>When to Sell — Practical Framework</span>
            {guideOpen ? <ChevronDown className="h-4 w-4 text-subtle" /> : <ChevronRight className="h-4 w-4 text-subtle" />}
          </button>
          {guideOpen && (
            <div className="space-y-4 border-t border-[var(--border)] px-4 py-4 text-xs text-muted">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] uppercase text-subtle">
                      <th className="py-1.5 pr-3">Situation</th>
                      <th className="py-1.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SELL_FRAMEWORK.map((row) => (
                      <tr key={row.situation} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-1.5 pr-3">{row.situation}</td>
                        <td className="py-1.5 font-medium text-[var(--fg)]">{row.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <p className="mb-1 font-semibold text-red-600 dark:text-red-400">Strong reasons to sell immediately</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  {SELL_IMMEDIATELY.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-1 font-semibold text-emerald-600 dark:text-emerald-400">Don&apos;t sell just because…</p>
                <ul className="ml-4 list-disc space-y-0.5">
                  {DONT_SELL.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SELL_FRAMEWORK: { situation: string; action: string }[] = [
  { situation: "Stock becomes significantly overvalued", action: "Consider selling part or all" },
  { situation: "Investment thesis is broken", action: "Sell" },
  { situation: "A clearly better opportunity exists", action: "Consider rotating capital" },
  { situation: "One stock exceeds 20–25% of portfolio", action: "Rebalance / trim" },
  { situation: "Drops 10–15% from peak (momentum)", action: "Consider a trailing stop" },
  { situation: "Stock is up 20–30%", action: "Not necessarily a reason to sell" },
];

const SELL_IMMEDIATELY = [
  "Accounting fraud",
  "Unethical or incompetent management",
  "A deteriorating business model",
  "Long-term industry decline",
  "Rapidly increasing debt",
  "Persistent negative cash flow",
  "Loss of competitive advantage",
];

const DONT_SELL = [
  "You're up 10%",
  "The stock has gone up a lot",
  "\"Profit is profit\" — if the business keeps growing and stays reasonably valued, holding longer may produce far greater returns",
];

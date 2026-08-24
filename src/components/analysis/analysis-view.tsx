"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import {
  AnalysisDetailPanel,
  type Selection,
} from "@/components/analysis/analysis-detail-panel";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import type {
  CombinedAnalysisRow,
  TechnicalAnalysisRow,
  UniverseAnalysisBundle,
} from "@/lib/analysis/combined-analysis";
import type { SectorAnalysisResult } from "@/lib/analysis/sector-analysis";
import { SectorAnalysisView } from "@/components/analysis/sector-analysis-view";
import { EtfAnalysisView } from "@/components/analysis/etf-analysis-view";
import { FUNDAMENTAL_RULES, INDEX_RULES, TECHNICAL_RULES, COMBINED_RULES, AI_SCREENING_RULES } from "@/lib/analysis/scoring-rules";
import type { EtfAnalysisRow } from "@/lib/analysis/etf-universe";
import {
  INVESTMENT_MOTTO,
  INVESTMENT_PRINCIPLES,
  PRINCIPLES_IN_APP,
} from "@/lib/content/investment-principles";
import { StockEvaluationPanel } from "@/components/analysis/stock-evaluation-panel";
import { AverageDownPanel } from "@/components/analysis/average-down-panel";
import { ExitStrategyPanel } from "@/components/analysis/exit-strategy-panel";
import { AiHoldingsPanel } from "@/components/analysis/ai-holdings-panel";
import { AiScreeningPanel } from "@/components/analysis/ai-screening-panel";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

const EMPTY_BUNDLE: UniverseAnalysisBundle = {
  fundamental: [],
  technical: [],
  combined: [],
};

type LazyUniverse = "vn30" | "vn100" | "etf";

type MainTab = "portfolio" | "sector" | "etf" | "vn30" | "vn100" | "rules" | "principles" | "avg-down" | "exit" | "swing" | "ai" | "ai-screen";
type SubTab = "fundamental" | "technical" | "combined";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "ai", label: "AI Analyst" },
  { id: "ai-screen", label: "AI Screening" },
  { id: "sector", label: "Sector" },
  { id: "etf", label: "ETF" },
  { id: "vn30", label: "VN30" },
  { id: "vn100", label: "VN100" },
  { id: "avg-down", label: "Avg Down" },
  { id: "exit", label: "Exit Strategy" },
  { id: "swing", label: "Short Swing" },
  { id: "rules", label: "Scoring rules" },
  { id: "principles", label: "Principles" },
];

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "fundamental", label: "Fundamental" },
  { id: "technical", label: "Technical" },
  { id: "combined", label: "Combined" },
];

function recVariant(rec: string | undefined) {
  const u = (rec ?? "").toUpperCase();
  if (u.includes("ACCUMULATE") || u.includes("BUY")) return "success" as const;
  if (u.includes("SELL") || u.includes("AVOID")) return "danger" as const;
  if (u.includes("TRIM")) return "warning" as const;
  if (u.includes("WATCH")) return "info" as const;
  return "default" as const;
}

function scoreVariant(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 55) return "info" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
}

function SymbolCell({
  symbol,
  name,
  sector,
  owned,
  isEtf,
}: {
  symbol: string;
  name?: string;
  sector?: string;
  owned?: Set<string>;
  isEtf?: boolean;
}) {
  const sym = symbol.toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <StockAvatar symbol={sym} sector={sector} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <Link
            href={`/stocks/${sym}`}
            className="font-semibold text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {sym}
          </Link>
          {isEtf && (
            <Badge variant="info" className="text-[9px] px-1 py-0">
              ETF
            </Badge>
          )}
          {owned?.has(sym) && (
            <Badge variant="default" className="text-[9px] px-1 py-0">
              owned
            </Badge>
          )}
        </div>
        {name && <div className="text-[10px] text-muted">{name}</div>}
      </div>
    </div>
  );
}

function FundamentalTable({
  rows,
  owned,
  selectedSymbol,
  onSelect,
}: {
  rows: FundamentalAnalysisRow[];
  owned?: Set<string>;
  selectedSymbol: string | null;
  onSelect: (row: FundamentalAnalysisRow) => void;
}) {
  type SortKey =
    | "symbol"
    | "sector"
    | "score"
    | "quality"
    | "growth"
    | "value"
    | "stability"
    | "roe"
    | "pe"
    | "pb";

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("score", "desc");
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "sector":
          cmp = compareStrings(a.sector, b.sector);
          break;
        case "score":
          cmp = compareNumbers(a.breakdown.finalScore, b.breakdown.finalScore);
          break;
        case "quality":
          cmp = compareNumbers(a.breakdown.qualityScore, b.breakdown.qualityScore);
          break;
        case "growth":
          cmp = compareNumbers(a.breakdown.growthScore, b.breakdown.growthScore);
          break;
        case "value":
          cmp = compareNumbers(a.breakdown.valuationScore, b.breakdown.valuationScore);
          break;
        case "stability":
          cmp = compareNumbers(a.breakdown.stabilityScore, b.breakdown.stabilityScore);
          break;
        case "roe":
          cmp = compareNumbers(a.roe, b.roe);
          break;
        case "pe":
          cmp = compareNumbers(a.pe, b.pe);
          break;
        case "pb":
          cmp = compareNumbers(a.pb, b.pb);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [rows, sortKey, sortDir]);

  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[1000px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Sector" column="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Score" column="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Quality" column="quality" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Growth" column="growth" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Value" column="value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Stability" column="stability" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="ROE" column="roe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="P/E" column="pe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="P/B" column="pb" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr
            key={`${r.symbol}-${i}`}
            onClick={() => onSelect(r)}
            className={`cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)] ${
              selectedSymbol === r.symbol.toUpperCase()
                ? "bg-[var(--accent-bg)]"
                : ""
            }`}
          >
            <td className="px-2 py-1.5 text-subtle">{i + 1}</td>
            <td className="px-2 py-1.5">
              <SymbolCell symbol={r.symbol} name={r.name} sector={r.sector} owned={owned} isEtf={r.isEtf} />
            </td>
            <td className="px-2 py-1.5 text-xs text-muted">{r.sector}</td>
            {r.isEtf ? (
              <td colSpan={8} className="px-2 py-1.5 text-center text-xs text-subtle italic">
                No fundamental data — ETF tracks an index
              </td>
            ) : (
              <>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant={scoreVariant(r.breakdown.finalScore)} className="font-mono text-[10px]">{r.breakdown.finalScore}</Badge>
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.breakdown.qualityScore}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.breakdown.growthScore}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.breakdown.valuationScore}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.breakdown.stabilityScore}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.roe != null ? `${r.roe.toFixed(1)}%` : "—"}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.pe != null ? r.pe.toFixed(1) : "—"}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.pb != null ? r.pb.toFixed(2) : "—"}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TechnicalTable({
  rows,
  owned,
  selectedSymbol,
  onSelect,
}: {
  rows: TechnicalAnalysisRow[];
  owned?: Set<string>;
  selectedSymbol: string | null;
  onSelect: (row: TechnicalAnalysisRow) => void;
}) {
  type SortKey = "symbol" | "price" | "tech" | "rating" | "trend" | "momentum" | "sr";

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("tech", "desc");
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "price":
          cmp = compareNumbers(a.currentPrice, b.currentPrice);
          break;
        case "tech":
          cmp = compareNumbers(a.technicalScore, b.technicalScore);
          break;
        case "rating":
          cmp = compareStrings(a.technicalRating, b.technicalRating);
          break;
        case "trend":
          cmp = compareStrings(a.maTrend, b.maTrend);
          break;
        case "momentum":
          cmp = compareStrings(a.momentum, b.momentum);
          break;
        case "sr":
          cmp = compareStrings(a.supportResistance, b.supportResistance);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [rows, sortKey, sortDir]);

  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[1000px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Price ₫" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
          <SortableTableHeader label="Tech" column="tech" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Rating" column="rating" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Trend" column="trend" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Momentum" column="momentum" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="S/R" column="sr" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr
            key={`${r.symbol}-${i}`}
            onClick={() => onSelect(r)}
            className={`cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)] ${
              selectedSymbol === r.symbol.toUpperCase()
                ? "bg-[var(--accent-bg)]"
                : ""
            }`}
          >
            <td className="px-2 py-1.5 text-subtle">{i + 1}</td>
            <td className="px-2 py-1.5">
              <SymbolCell symbol={r.symbol} name={r.name} sector={r.sector} owned={owned} isEtf={r.isEtf} />
            </td>
            <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtPrice(r.currentPrice)}</td>
            <td className="px-2 py-1.5 text-center font-mono font-semibold">{r.technicalScore}</td>
            <td className="px-2 py-1.5 text-xs text-muted">{r.technicalRating}</td>
            <td className="max-w-[180px] truncate px-2 py-1.5 text-xs text-muted" title={r.maTrend}>{r.maTrend}</td>
            <td className="max-w-[140px] truncate px-2 py-1.5 text-xs text-muted" title={r.momentum}>{r.momentum}</td>
            <td className="max-w-[160px] truncate px-2 py-1.5 text-xs text-muted" title={r.supportResistance}>{r.supportResistance}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CombinedTable({
  rows,
  owned,
  selectedSymbol,
  onSelect,
}: {
  rows: CombinedAnalysisRow[];
  owned?: Set<string>;
  selectedSymbol: string | null;
  onSelect: (row: CombinedAnalysisRow) => void;
}) {
  type SortKey = "symbol" | "tech" | "fund" | "combined" | "signal";

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("combined", "desc");
  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "tech":
          cmp = compareNumbers(a.technicalScore, b.technicalScore);
          break;
        case "fund":
          cmp = compareNumbers(a.fundamentalScore, b.fundamentalScore);
          break;
        case "combined":
          cmp = compareNumbers(a.combinedScore, b.combinedScore);
          break;
        case "signal":
          cmp = compareStrings(a.recommendation, b.recommendation);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [rows, sortKey, sortDir]);

  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
          <SortableTableHeader label="Tech" column="tech" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Fund" column="fund" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Combined" column="combined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
          <SortableTableHeader label="Signal" column="signal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr
            key={`${r.symbol}-${i}`}
            onClick={() => onSelect(r)}
            className={`cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)] ${
              selectedSymbol === r.symbol.toUpperCase()
                ? "bg-[var(--accent-bg)]"
                : ""
            }`}
          >
            <td className="px-2 py-1.5 text-subtle">{i + 1}</td>
            <td className="px-2 py-1.5">
              <SymbolCell symbol={r.symbol} name={r.name} sector={r.sector} owned={owned} isEtf={r.isEtf} />
            </td>
            <td className="px-2 py-1.5 text-center font-mono">{r.technicalScore}</td>
            <td className="px-2 py-1.5 text-center font-mono text-subtle">
              {r.isEtf ? <span className="text-[10px] italic">N/A</span> : r.fundamentalScore}
            </td>
            <td className="px-2 py-1.5 text-center font-mono font-semibold">
              {r.combinedScore}
              {r.isEtf && <span className="ml-1 text-[9px] text-subtle">(tech)</span>}
            </td>
            <td className="px-2 py-1.5">
              <Badge variant={recVariant(r.recommendation)} className="text-[10px]">{r.recommendation}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtPrice(price: number | null | undefined): string {
  if (price == null || price <= 0) return "—";
  return price.toLocaleString("vi-VN");
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">No data for this panel.</p>;
}

function RulesPanel() {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <h3 className="mb-2 font-semibold">{FUNDAMENTAL_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{FUNDAMENTAL_RULES.formula}</p>
        {FUNDAMENTAL_RULES.categories.map((c) => (
          <div key={c.name} className="mb-3">
            <p className="text-xs font-medium text-accent">{c.name}</p>
            <ul className="ml-4 list-disc text-xs text-muted">
              {c.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-[10px] text-subtle">
          Data: {FUNDAMENTAL_RULES.dataSources.join(" · ")}
        </p>
      </section>

      <section className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 font-semibold">{TECHNICAL_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{TECHNICAL_RULES.formula}</p>
        {TECHNICAL_RULES.categories.map((c) => (
          <div key={c.name} className="mb-3">
            <p className="text-xs font-medium text-accent">{c.name}</p>
            <ul className="ml-4 list-disc text-xs text-muted">
              {c.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mb-1 text-xs font-medium text-accent">Rating labels</p>
        <ul className="ml-4 list-disc text-xs text-muted">
          {TECHNICAL_RULES.ratings.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-subtle">
          Data: {TECHNICAL_RULES.dataSources.join(" · ")}
        </p>
      </section>

      <section className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 font-semibold">{COMBINED_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{COMBINED_RULES.formula}</p>
        <p className="mb-2 text-xs text-muted">{COMBINED_RULES.note}</p>
        <ul className="ml-4 list-disc text-xs text-muted">
          {COMBINED_RULES.signals.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 font-semibold">Universes</h3>
        <ul className="ml-4 list-disc text-xs text-muted">
          <li>{INDEX_RULES.portfolio}</li>
          <li>{INDEX_RULES.sector}</li>
          <li>{INDEX_RULES.vn30}</li>
          <li>{INDEX_RULES.vn100}</li>
        </ul>
      </section>

      <section className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 font-semibold">{AI_SCREENING_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{AI_SCREENING_RULES.note}</p>
        <ol className="ml-4 list-decimal text-xs text-muted">
          {AI_SCREENING_RULES.steps.map((s) => (
            <li key={s} className="mb-1">{s}</li>
          ))}
        </ol>
        <p className="mb-1 mt-2 text-xs font-medium text-accent">Data proxies (never fabricated — closest honest derivation)</p>
        <ul className="ml-4 list-disc text-xs text-muted">
          {AI_SCREENING_RULES.dataProxies.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── */
/*  Short Swing interactive screener                             */
/* ───────────────────────────────────────────────────────────── */

type TechSignal = { indicator: string; value: number; signal: string };

type MarketCtx = {
  vnIndexChange: number;
  topSectors: string[];
  sentiment: string;
};

type SwingResult = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  rsi: number;
  high52w: number;
  // criteria (8 scored)
  aboveMA20: boolean;       // C1 — price above MA20
  aboveMA50: boolean;       // C2 — price above MA50
  rsiStrong: boolean;       // C3 — RSI > 60
  volumeSpike: boolean;     // C4 — volume ≥ 2× 20d avg
  near52wHigh: boolean;     // C5 — within 15% of 52-week high
  outperformsMarket: boolean; // C6 — change% > VN-Index change%
  leadingSector: boolean;   // C7 — sector in top 3 performers
  positiveMomentum: boolean;// C8 — positive daily change
  score: number;
  signal: "ENTRY" | "WATCH" | "SKIP";
  error?: string;
};

function buildSwingResult(
  stock: { symbol: string; name: string; sector: string; price: number; changePercent: number; rsi: number; high52w: number; analystRating?: string },
  technicals: TechSignal[],
  ctx: MarketCtx | null,
): SwingResult {
  const sig = (ind: string) => technicals.find((t) => t.indicator === ind);
  const aboveMA20 = sig("MA 20")?.signal === "Bullish";
  const aboveMA50 = sig("MA 50")?.signal === "Bullish";
  const rsiStrong = stock.rsi > 60;
  const volumeSpike = sig("Volume Ratio")?.signal === "Bullish";
  const near52wHigh = stock.high52w > 0 && stock.price / stock.high52w > 0.85;
  const outperformsMarket = ctx != null && stock.changePercent > ctx.vnIndexChange;
  const leadingSector = ctx != null && ctx.topSectors.some(
    (s) => s.toLowerCase() === stock.sector.toLowerCase(),
  );
  const positiveMomentum = stock.changePercent > 0;

  const criteria = [aboveMA20, aboveMA50, rsiStrong, volumeSpike, near52wHigh, outperformsMarket, leadingSector, positiveMomentum];
  const score = criteria.filter(Boolean).length;
  const signal: SwingResult["signal"] = score >= 6 ? "ENTRY" : score >= 3 ? "WATCH" : "SKIP";

  return { symbol: stock.symbol, name: stock.name, sector: stock.sector, price: stock.price, changePercent: stock.changePercent, rsi: stock.rsi, high52w: stock.high52w, aboveMA20, aboveMA50, rsiStrong, volumeSpike, near52wHigh, outperformsMarket, leadingSector, positiveMomentum, score, signal };
}

function Check({ ok }: { ok: boolean }) {
  return (
    <span className={`text-sm font-bold ${ok ? "text-success" : "text-subtle"}`}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

function SwingBadge({ signal }: { signal: SwingResult["signal"] }) {
  const cls = signal === "ENTRY"
    ? "bg-success/15 text-success ring-success/30"
    : signal === "WATCH"
      ? "bg-amber-500/15 text-amber-500 ring-amber-400/30"
      : "bg-[var(--bg-secondary)] text-subtle ring-[var(--border)]";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>{signal}</span>;
}

function ShortSwingPanel({ defaultSymbols }: { defaultSymbols: string[] }) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SwingResult[]>([]);
  const [marketCtx, setMarketCtx] = useState<MarketCtx | null>(null);
  const [loading, setLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const hasRun = useRef(false);

  const runScreener = useCallback(async (overrideInput?: string) => {
    const raw = overrideInput ?? input;
    const symbols = raw.toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!symbols.length) return;

    setLoading(true);
    setResults([]);

    // Fetch market context + all stocks in parallel
    const [marketRes, ...stockSettled] = await Promise.allSettled([
      fetch("/api/market").then((r) => r.json()) as Promise<{ market: { indices: { symbol: string; changePercent: number }[]; sectors: { sector: string; changePercent: number }[]; sentiment: string } }>,
      ...symbols.map(async (sym): Promise<SwingResult> => {
        const res = await fetch(`/api/stocks/${sym}?lite=true`);
        if (!res.ok) {
          const errResult: SwingResult = {
            symbol: sym, name: sym, sector: "—", price: 0, changePercent: 0, rsi: 0, high52w: 0,
            aboveMA20: false, aboveMA50: false, rsiStrong: false, volumeSpike: false,
            near52wHigh: false, outperformsMarket: false, leadingSector: false, positiveMomentum: false,
            score: 0, signal: "SKIP",
            error: res.status === 404 ? "Symbol not found" : "Fetch failed",
          };
          return errResult;
        }
        const data = await res.json() as {
          stock: { symbol: string; name: string; sector: string; price: number; changePercent: number; rsi: number; high52w: number; analystRating?: string };
          technicals: TechSignal[];
        };
        return buildSwingResult(data.stock, data.technicals ?? [], null);
      }),
    ]);

    // Resolve market context
    let ctx: MarketCtx | null = null;
    if (marketRes.status === "fulfilled") {
      const m = marketRes.value.market;
      const vnIdx = m.indices?.find((i) => i.symbol === "VNINDEX" || i.symbol === "VN-Index");
      const topSectors = [...(m.sectors ?? [])].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((s) => s.sector);
      ctx = { vnIndexChange: vnIdx?.changePercent ?? 0, topSectors, sentiment: m.sentiment ?? "Neutral" };
      setMarketCtx(ctx);
    }

    // Re-score with market context
    const rows: SwingResult[] = stockSettled.map((r) => {
      if (r.status === "rejected") {
        const errResult: SwingResult = {
          symbol: "ERR", name: "—", sector: "—", price: 0, changePercent: 0, rsi: 0, high52w: 0,
          aboveMA20: false, aboveMA50: false, rsiStrong: false, volumeSpike: false,
          near52wHigh: false, outperformsMarket: false, leadingSector: false, positiveMomentum: false,
          score: 0, signal: "SKIP", error: "Unknown error",
        };
        return errResult;
      }
      if (r.value.error) return r.value;
      // Re-build with market context now available
      return { ...r.value, outperformsMarket: ctx != null && r.value.changePercent > ctx.vnIndexChange, leadingSector: ctx != null && ctx.topSectors.some((s) => s.toLowerCase() === r.value.sector.toLowerCase()) };
    }).map((r) => {
      if (r.error) return r;
      const score = [r.aboveMA20, r.aboveMA50, r.rsiStrong, r.volumeSpike, r.near52wHigh, r.outperformsMarket, r.leadingSector, r.positiveMomentum].filter(Boolean).length;
      return { ...r, score, signal: (score >= 6 ? "ENTRY" : score >= 3 ? "WATCH" : "SKIP") as SwingResult["signal"] };
    });

    rows.sort((a, b) => b.score - a.score);
    setResults(rows);
    setLoading(false);
  }, [input]);

  // Auto-run once with VN30 on mount (input stays empty — user types to re-run)
  useEffect(() => {
    if (hasRun.current || !defaultSymbols.length) return;
    hasRun.current = true;
    void runScreener(defaultSymbols.join(", "));
  }, [defaultSymbols, runScreener]);

  return (
    <div className="space-y-4 text-sm">
      {/* Market context banner */}
      {marketCtx && (
        <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-xs ${
          marketCtx.sentiment === "Bullish" ? "border-success/30 bg-success/5 text-success" :
          marketCtx.sentiment === "Bearish" ? "border-danger/30 bg-danger/5 text-danger" :
          "border-[var(--border)] bg-[var(--bg-secondary)] text-muted"}`}
        >
          <span className="font-semibold">
            VN-Index: {marketCtx.vnIndexChange >= 0 ? "+" : ""}{marketCtx.vnIndexChange.toFixed(2)}%
          </span>
          <span className="text-subtle">·</span>
          <span>Market: <strong>{marketCtx.sentiment}</strong></span>
          {marketCtx.topSectors.length > 0 && (
            <>
              <span className="text-subtle">·</span>
              <span>Top sectors: {marketCtx.topSectors.join(", ")}</span>
            </>
          )}
        </div>
      )}

      {/* Input */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <p className="mb-2 text-xs font-semibold text-[var(--fg)]">
          Enter tickers to screen <span className="font-normal text-muted">(1–2 week swing hold)</span>
        </p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void runScreener(); }}
            placeholder="e.g. FPT, VIC, VNM, HPG, MBB"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--input-bg,var(--card))] px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="button"
            disabled={loading || !input.trim()}
            onClick={() => void runScreener()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => setInput(defaultSymbols.join(", "))}
            className="rounded-md bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent ring-1 ring-accent/20 transition hover:bg-accent/20 disabled:opacity-50"
          >
            Load VN30
          </button>
          <span className="text-[10px] text-subtle">or click a symbol:</span>
          <div className="flex flex-wrap gap-1">
            {defaultSymbols.slice(0, 15).map((sym) => (
              <button
                key={sym}
                type="button"
                disabled={loading}
                onClick={() => {
                  const current = input.toUpperCase().split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
                  if (!current.includes(sym)) {
                    setInput(current.length ? `${input}, ${sym}` : sym);
                  }
                }}
                className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-[var(--border)] transition hover:bg-[var(--card)] hover:text-accent disabled:opacity-50"
              >
                {sym}
              </button>
            ))}
            {defaultSymbols.length > 15 && (
              <span className="text-[10px] text-subtle">+{defaultSymbols.length - 15} more in VN30</span>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-subtle">
          Checks 8 swing criteria per stock. Type tickers or click chips to add, then click Analyze.
        </p>
      </div>

      {/* Results table */}
      {loading && (
        <div className="py-8 text-center text-sm text-muted">Fetching market data and technicals…</div>
      )}

      {results.length > 0 && !loading && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
          <table className="w-full min-w-[960px] text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[9px] uppercase text-subtle">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2 text-left">Symbol</th>
                <th className="px-2 py-2 text-right">Price ₫</th>
                <th className="px-2 py-2 text-center">Chg%</th>
                <th className="px-2 py-2 text-center">RSI</th>
                <th className="px-2 py-2 text-center" title="C1: Price above MA20">MA20↑</th>
                <th className="px-2 py-2 text-center" title="C2: Price above MA50">MA50↑</th>
                <th className="px-2 py-2 text-center" title="C3: RSI > 60">RSI&gt;60</th>
                <th className="px-2 py-2 text-center" title="C4: Volume ≥ 2× 20-day average">Vol×2</th>
                <th className="px-2 py-2 text-center" title="C5: Within 15% of 52-week high">52wHi</th>
                <th className="px-2 py-2 text-center" title="C6: Outperforms VN-Index today">RS&gt;Idx</th>
                <th className="px-2 py-2 text-center" title="C7: Sector in top 3 performers">Lead§</th>
                <th className="px-2 py-2 text-center" title="C8: Positive daily change">+Mom</th>
                <th className="px-2 py-2 text-center">Score</th>
                <th className="px-2 py-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.symbol + i} className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)] ${r.signal === "ENTRY" ? "bg-success/5" : ""}`}>
                  <td className="px-2 py-2 text-subtle">{i + 1}</td>
                  <td className="px-2 py-2">
                    <Link href={`/stocks/${r.symbol}`} className="font-semibold text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.symbol}
                    </Link>
                    {r.error ? (
                      <div className="text-[9px] text-danger">{r.error}</div>
                    ) : (
                      <div className="max-w-[100px] truncate text-[9px] text-muted">{r.name}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{r.price > 0 ? r.price.toLocaleString("vi-VN") : "—"}</td>
                  <td className={`px-2 py-2 text-center font-data ${r.changePercent >= 0 ? "text-gain" : "text-loss"}`}>
                    {r.price > 0 ? `${r.changePercent >= 0 ? "+" : ""}${r.changePercent.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-2 py-2 text-center font-mono">{r.price > 0 ? r.rsi.toFixed(0) : "—"}</td>
                  <td className="px-2 py-2 text-center"><Check ok={r.aboveMA20} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.aboveMA50} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.rsiStrong} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.volumeSpike} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.near52wHigh} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.outperformsMarket} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.leadingSector} /></td>
                  <td className="px-2 py-2 text-center"><Check ok={r.positiveMomentum} /></td>
                  <td className="px-2 py-2 text-center">
                    <span className={`font-bold ${r.score >= 6 ? "text-success" : r.score >= 3 ? "text-amber-500" : "text-subtle"}`}>
                      {r.price > 0 ? `${r.score}/8` : "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2"><SwingBadge signal={r.signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
          <div className="flex flex-wrap gap-4 text-[11px] text-muted">
            <span><span className="font-semibold text-success">ENTRY</span> — 6–8/8. Strong setup, consider entering.</span>
            <span><span className="font-semibold text-amber-500">WATCH</span> — 3–5/8. Wait for more confirmation.</span>
            <span><span className="font-semibold text-subtle">SKIP</span> — 0–2/8. Setup not ready.</span>
            <span className="text-subtle">C6 RS&gt;Idx and C7 Lead§ require live VN-Index & sector data.</span>
          </div>
        </div>
      )}

      {/* Collapsible 10-step guide */}
      <div className="rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-xs font-semibold text-[var(--fg)] hover:bg-[var(--bg-secondary)]"
        >
          <span>10-Step Methodology Guide</span>
          <span className="text-subtle">{guideOpen ? "▲" : "▼"}</span>
        </button>
        {guideOpen && (
          <div className="border-t border-[var(--border)] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {SWING_GUIDE.map((step) => (
                <div key={step.num} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-fg">
                      {step.num}
                    </span>
                    <p className="text-xs font-semibold text-[var(--fg)]">{step.title}</p>
                  </div>
                  <p className="text-[11px] text-muted">{step.body}</p>
                  {step.bullets && (
                    <ul className="mt-2 space-y-0.5">
                      {step.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-1.5 text-[11px] text-muted">
                          <span className="h-1 w-1 shrink-0 rounded-full bg-accent" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SWING_GUIDE = [
  {
    num: 1,
    title: "Assess the overall market first",
    body: "If the main index is in an uptrend, trade success probability is higher. Vietnam: track VN-Index. Avoid buying strong stocks when the whole market is correcting sharply.",
  },
  {
    num: 2,
    title: "Find the strongest sector",
    body: "Markets typically have 1–3 leading sectors: AI, Semiconductors, Banking, Securities, Energy, Defense. If 10 AI stocks all rise while others go sideways, AI is the leader.",
  },
  {
    num: 3,
    title: "Relative Strength (most important)",
    body: "Ask: is this stock stronger than the market? Example: Index +2%, Stock A +12% → Stock A is outperforming. Leaders rarely fall hard on red days and surge on green days.",
  },
  {
    num: 4,
    title: "Volume must increase",
    body: "This is the institutional footprint. Volume today = 2–3× 20-day average + price up >4% → strong money inflow signal. Rising price on low volume is unreliable.",
  },
  {
    num: 5,
    title: "Breakout from base consolidation",
    body: "Leaders typically consolidate sideways for weeks, then break out with high volume. Avoid buying after a stock has already run 40–50% in just a few days.",
  },
  {
    num: 6,
    title: "Catalyst required",
    body: "A catalyst focuses institutional capital: earnings report, major contract win, AI theme, new policy, Fed decision, oil price, chip shortage, trade tariffs.",
  },
  {
    num: 7,
    title: "Watch ETF money flows",
    body: "When a sector ETF attracts heavy inflows, stocks within that sector benefit broadly from the rising tide.",
  },
  {
    num: 8,
    title: "Rank by Relative Strength criteria",
    bullets: [
      "Price above MA20",
      "Price above MA50",
      "Volume > 2× average",
      "Breaking out of base",
      "RS stronger than index",
      "Has catalyst",
      "Leading sector",
    ],
    body: "Stocks meeting 6–7 criteria are worth watching closely.",
  },
  {
    num: 9,
    title: 'Watch stocks that "refuse to fall"',
    body: "This is a very strong signal. Market drops 2%, stock drops only 0.2% or still rises → institutions are likely accumulating.",
  },
  {
    num: 10,
    title: "Track High of Day / 52-week High lists",
    body: "Leaders regularly make new highs with high volume, closing near the top of the day's range — behaviour driven by institutional priority buying.",
  },
];

function PrinciplesPanel() {
  return (
    <div className="space-y-5 text-sm">
      <blockquote className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
        <p className="text-sm font-medium italic text-[var(--fg)]">
          &ldquo;{INVESTMENT_MOTTO.quote}&rdquo;
        </p>
        <p className="mt-1 text-[10px] text-subtle">{INVESTMENT_MOTTO.attribution}</p>
      </blockquote>

      {INVESTMENT_PRINCIPLES.map((p) => (
        <section key={p.id} className="border-b border-[var(--border)] pb-4 last:border-0">
          <h3 className="font-semibold text-[var(--fg)]">{p.title}</h3>
          <p className="mt-1 text-xs text-muted">{p.summary}</p>
          <ul className="mt-2 ml-4 list-disc text-xs text-muted">
            {p.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ))}

      <section className="pt-2">
        <p className="text-xs font-medium text-accent">Referenced in this app</p>
        <ul className="mt-1 ml-4 list-disc text-xs text-muted">
          {PRINCIPLES_IN_APP.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-subtle">
          Canonical copy: data/investment-principles.json · src/lib/content/investment-principles.ts
        </p>
      </section>
    </div>
  );
}

export function AnalysisView({
  portfolio,
  sectorAnalysis,
  vn30Symbols,
  ownedSymbols,
  sectorTargets,
  enrichedHoldings,
}: {
  portfolio: UniverseAnalysisBundle;
  sectorAnalysis?: SectorAnalysisResult;
  vn30Symbols: string[];
  ownedSymbols?: string[];
  sectorTargets?: Record<string, number>;
  enrichedHoldings?: EnrichedHolding[];
}) {
  const [mainTab, setMainTab] = useState<MainTab>("portfolio");
  const [subTab, setSubTab] = useState<SubTab>("fundamental");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [vn30, setVn30] = useState<UniverseAnalysisBundle>(EMPTY_BUNDLE);
  const [vn100, setVn100] = useState<UniverseAnalysisBundle>(EMPTY_BUNDLE);
  const [etfBundle, setEtfBundle] = useState<EtfAnalysisRow[]>([]);
  // Track in-flight loads per universe so the active tab shows a spinner while
  // background prefetch of the other universes stays silent.
  const [loadingUniverses, setLoadingUniverses] = useState<Set<LazyUniverse>>(
    () => new Set(),
  );
  const loadedRef = useRef<Record<LazyUniverse, boolean>>({
    vn30: false,
    vn100: false,
    etf: false,
  });
  const bgStartedRef = useRef(false);
  const owned = new Set((ownedSymbols ?? []).map((s) => s.toUpperCase()));

  const loadLazyUniverse = useCallback(async (universe: LazyUniverse) => {
    if (loadedRef.current[universe]) return;
    loadedRef.current[universe] = true;
    setLoadingUniverses((prev) => new Set(prev).add(universe));
    try {
      const res = await fetch(`/api/analysis/bundle?universe=${universe}`);
      if (!res.ok) {
        loadedRef.current[universe] = false;
        return;
      }
      const data = (await res.json()) as {
        bundle?: UniverseAnalysisBundle;
        etfBundle?: EtfAnalysisRow[];
      };
      if (universe === "vn30" && data.bundle) setVn30(data.bundle);
      if (universe === "vn100" && data.bundle) setVn100(data.bundle);
      if (universe === "etf" && data.etfBundle) setEtfBundle(data.etfBundle);
    } catch {
      loadedRef.current[universe] = false;
    } finally {
      setLoadingUniverses((prev) => {
        const next = new Set(prev);
        next.delete(universe);
        return next;
      });
    }
  }, []);

  // Load the active lazy tab immediately when opened. Kicks off an async
  // fetch (loadLazyUniverse flips its own loading flag synchronously before
  // awaiting) rather than synchronizing to a prop, so this is intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional "start async op" trigger, see comment above
    if (mainTab === "vn30") void loadLazyUniverse("vn30");
    if (mainTab === "vn100") void loadLazyUniverse("vn100");
    if (mainTab === "etf") void loadLazyUniverse("etf");
  }, [mainTab, loadLazyUniverse]);

  // Background-prefetch every lazy universe once, after first paint, so
  // switching to VN30 / VN100 / ETF is instant. Runs sequentially and defers
  // to browser idle time to avoid competing with the active tab's fetch.
  useEffect(() => {
    if (bgStartedRef.current) return;
    bgStartedRef.current = true;
    let cancelled = false;

    const prefetchAll = () => {
      if (cancelled) return;
      // Fire all universes in parallel so the slowest (ETF) starts immediately
      // instead of waiting behind VN30/VN100.
      for (const universe of ["vn30", "vn100", "etf"] as LazyUniverse[]) {
        void loadLazyUniverse(universe);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(() => prefetchAll());
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(id);
      };
    }
    const timer = setTimeout(() => prefetchAll(), 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadLazyUniverse]);

  const bundle =
    mainTab === "portfolio"
      ? portfolio
      : mainTab === "vn30"
        ? vn30
        : mainTab === "vn100"
          ? vn100
          : null;

  const description =
    mainTab === "portfolio"
      ? INDEX_RULES.portfolio
      : mainTab === "vn30"
        ? INDEX_RULES.vn30
        : mainTab === "vn100"
          ? INDEX_RULES.vn100
          : "";

  const noSubTabs = mainTab === "rules" || mainTab === "principles" || mainTab === "sector" || mainTab === "etf" || mainTab === "avg-down" || mainTab === "exit" || mainTab === "swing" || mainTab === "ai" || mainTab === "ai-screen";

  const selectedSymbol = selection?.row.symbol.toUpperCase() ?? null;

  return (
    <div className="space-y-3">
      <div className="tab-scroll -mx-1 flex gap-1 overflow-x-auto rounded-xl bg-[var(--bg-secondary)] p-1 ring-1 ring-[var(--border)]">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMainTab(t.id);
              setSelection(null);
            }}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all sm:py-1.5 ${
              mainTab === t.id
                ? "bg-accent text-accent-fg shadow-sm ring-1 ring-accent/30"
                : "text-[var(--fg)] opacity-60 hover:bg-[var(--card)] hover:opacity-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadingUniverses.size > 0 && (
        <p className="flex items-center gap-1.5 px-1 text-[10px] text-subtle">
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          Preparing {[...loadingUniverses].map((u) => u.toUpperCase()).join(" · ")} in background…
        </p>
      )}

      {!noSubTabs && (
        <div className="tab-scroll -mx-1 flex gap-1.5 overflow-x-auto pb-0.5">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSubTab(t.id);
                setSelection(null);
              }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all sm:py-1 ${
                subTab === t.id
                  ? "bg-[var(--accent-bg)] text-accent ring-1 ring-accent/30"
                  : "text-[var(--fg)] opacity-55 ring-1 ring-[var(--border)] hover:bg-[var(--bg-secondary)] hover:opacity-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {selection && (
        <AnalysisDetailPanel
          selection={selection}
          onClose={() => setSelection(null)}
        />
      )}

      {mainTab === "ai" ? (
        <AiHoldingsPanel />
      ) : mainTab === "ai-screen" ? (
        <AiScreeningPanel />
      ) : mainTab === "swing" ? (
        <Card className="!p-4">
          <CardTitle className="!mb-1 !text-base">Short Swing Screener</CardTitle>
          <p className="mb-4 text-xs text-muted">
            Score any VN tickers against 8 swing-trading criteria (1–2 week hold). Enter tickers to begin.
          </p>
          <ShortSwingPanel defaultSymbols={vn30Symbols} />
        </Card>
      ) : mainTab === "avg-down" ? (
        <Card className="!p-4">
          <CardTitle className="!mb-1 !text-base">Average Down Decision Framework</CardTitle>
          <p className="mb-4 text-xs text-muted">
            6-point checklist to decide whether averaging down a losing position is rational — or just loss aversion.
          </p>
          <AverageDownPanel
            holdings={enrichedHoldings ?? []}
            fundamentalRows={portfolio.fundamental}
            combinedRows={portfolio.combined}
            sectorAnalysis={sectorAnalysis}
          />
        </Card>
      ) : mainTab === "exit" ? (
        <Card className="!p-4">
          <CardTitle className="!mb-1 !text-base">Exit Strategy Framework</CardTitle>
          <p className="mb-4 text-xs text-muted">
            6-factor sell analysis per holding — valuation, thesis, profit target, trailing stop,
            concentration, and opportunity cost — with a number-driven action suggestion.
          </p>
          <ExitStrategyPanel
            holdings={enrichedHoldings ?? []}
            fundamentalRows={portfolio.fundamental}
            combinedRows={portfolio.combined}
            sectorAnalysis={sectorAnalysis}
          />
        </Card>
      ) : mainTab === "sector" && sectorAnalysis ? (
        <SectorAnalysisView data={sectorAnalysis} initialSectorTargets={sectorTargets} />
      ) : mainTab === "etf" ? (
        loadingUniverses.has("etf") && etfBundle.length === 0 ? (
          <Card className="!p-8">
            <div className="flex items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Loading ETF analysis…
            </div>
          </Card>
        ) : (
          <EtfAnalysisView rows={etfBundle} />
        )
      ) : (
        <Card className="!p-4">
          <>
            <CardTitle className="!mb-1 !text-base">
              {MAIN_TABS.find((t) => t.id === mainTab)?.label}
              {!noSubTabs &&
                ` — ${SUB_TABS.find((t) => t.id === subTab)?.label}`}
            </CardTitle>
            {!noSubTabs && bundle && (
              <p className="mb-3 text-xs text-muted">
                {description} · Click a row for analysis detail · Click symbol for stock page
              </p>
            )}
            <div className="table-scroll overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
              {(mainTab === "vn30" && loadingUniverses.has("vn30") && vn30.combined.length === 0) ||
              (mainTab === "vn100" && loadingUniverses.has("vn100") && vn100.combined.length === 0) ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  Loading {mainTab.toUpperCase()} analysis…
                </div>
              ) : mainTab === "rules" ? (
                <div className="p-2">
                  <RulesPanel />
                </div>
              ) : mainTab === "principles" ? (
                <div className="grid gap-0 lg:grid-cols-[1fr_1px_1fr]">
                  {/* Left — Stock evaluator */}
                  <div className="p-4">
                    <StockEvaluationPanel />
                  </div>
                  {/* Divider */}
                  <div className="hidden bg-[var(--border)] lg:block" />
                  {/* Right — Investment principles */}
                  <div className="border-t border-[var(--border)] p-4 lg:border-t-0">
                    <p className="mb-3 text-sm font-semibold text-[var(--fg)]">Investment Principles</p>
                    <PrinciplesPanel />
                  </div>
                </div>
              ) : subTab === "fundamental" ? (
                <FundamentalTable
                  rows={bundle?.fundamental ?? []}
                  owned={owned}
                  selectedSymbol={selectedSymbol}
                  onSelect={(row) => setSelection({ kind: "fundamental", row })}
                />
              ) : subTab === "technical" ? (
                <TechnicalTable
                  rows={bundle?.technical ?? []}
                  owned={owned}
                  selectedSymbol={selectedSymbol}
                  onSelect={(row) => setSelection({ kind: "technical", row })}
                />
              ) : (
                <CombinedTable
                  rows={bundle?.combined ?? []}
                  owned={owned}
                  selectedSymbol={selectedSymbol}
                  onSelect={(row) => setSelection({ kind: "combined", row })}
                />
              )}
            </div>
          </>
        </Card>
      )}
    </div>
  );
}

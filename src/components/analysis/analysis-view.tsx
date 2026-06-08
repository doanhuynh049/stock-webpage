"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
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
import { FUNDAMENTAL_RULES, INDEX_RULES, TECHNICAL_RULES } from "@/lib/analysis/scoring-rules";

type MainTab = "portfolio" | "sector" | "vn30" | "vn100" | "rules";
type SubTab = "fundamental" | "technical" | "combined";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "sector", label: "Sector" },
  { id: "vn30", label: "VN30" },
  { id: "vn100", label: "VN100" },
  { id: "rules", label: "Scoring rules" },
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
  owned,
}: {
  symbol: string;
  name?: string;
  owned?: Set<string>;
}) {
  const sym = symbol.toUpperCase();
  return (
    <>
      <Link
        href={`/stocks/${sym}`}
        className="font-semibold text-accent hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {sym}
      </Link>
      {owned?.has(sym) && (
        <Badge variant="info" className="ml-1 text-[9px]">
          owned
        </Badge>
      )}
      {name && <div className="text-[10px] text-muted">{name}</div>}
    </>
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
  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[1000px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <th className="px-2 py-1.5">Symbol</th>
          <th className="px-2 py-1.5">Sector</th>
          <th className="px-2 py-1.5 text-center">Score</th>
          <th className="px-2 py-1.5 text-center">Quality</th>
          <th className="px-2 py-1.5 text-center">Growth</th>
          <th className="px-2 py-1.5 text-center">Value</th>
          <th className="px-2 py-1.5 text-center">Stability</th>
          <th className="px-2 py-1.5 text-center">ROE</th>
          <th className="px-2 py-1.5 text-center">P/E</th>
          <th className="px-2 py-1.5 text-center">P/B</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
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
              <SymbolCell symbol={r.symbol} name={r.name} owned={owned} />
            </td>
            <td className="px-2 py-1.5 text-xs text-muted">{r.sector}</td>
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
  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[900px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <th className="px-2 py-1.5">Symbol</th>
          <th className="px-2 py-1.5 text-center">Tech</th>
          <th className="px-2 py-1.5">Rating</th>
          <th className="px-2 py-1.5">Trend</th>
          <th className="px-2 py-1.5">Momentum</th>
          <th className="px-2 py-1.5">S/R</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
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
              <SymbolCell symbol={r.symbol} name={r.name} owned={owned} />
            </td>
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
  if (!rows?.length) return <Empty />;
  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead>
        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
          <th className="px-2 py-1.5">#</th>
          <th className="px-2 py-1.5">Symbol</th>
          <th className="px-2 py-1.5 text-center">Tech</th>
          <th className="px-2 py-1.5 text-center">Fund</th>
          <th className="px-2 py-1.5 text-center">Combined</th>
          <th className="px-2 py-1.5">Signal</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
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
              <SymbolCell symbol={r.symbol} owned={owned} />
            </td>
            <td className="px-2 py-1.5 text-center font-mono">{r.technicalScore}</td>
            <td className="px-2 py-1.5 text-center font-mono">{r.fundamentalScore}</td>
            <td className="px-2 py-1.5 text-center font-mono font-semibold">{r.combinedScore}</td>
            <td className="px-2 py-1.5">
              <Badge variant={recVariant(r.recommendation)} className="text-[10px]">{r.recommendation}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted">No data for this panel.</p>;
}

function RulesPanel() {
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="mb-2 font-semibold">{FUNDAMENTAL_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{FUNDAMENTAL_RULES.formula}</p>
        {FUNDAMENTAL_RULES.categories.map((c) => (
          <div key={c.name} className="mb-3">
            <p className="text-xs font-medium text-accent">{c.name}</p>
            <ul className="ml-4 list-disc text-xs text-muted">
              {c.rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        ))}
      </section>
      <section>
        <h3 className="mb-2 font-semibold">{TECHNICAL_RULES.title}</h3>
        <p className="mb-2 text-xs text-muted">{TECHNICAL_RULES.combinedFormula}</p>
        <ul className="ml-4 list-disc text-xs text-muted">
          {TECHNICAL_RULES.signals.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Universes</h3>
        <ul className="ml-4 list-disc text-xs text-muted">
          <li>{INDEX_RULES.portfolio}</li>
          <li>{INDEX_RULES.vn30}</li>
          <li>{INDEX_RULES.vn100}</li>
        </ul>
      </section>
    </div>
  );
}

export function AnalysisView({
  portfolio,
  vn30,
  vn100,
  sectorAnalysis,
  ownedSymbols,
}: {
  portfolio: UniverseAnalysisBundle;
  vn30: UniverseAnalysisBundle;
  vn100: UniverseAnalysisBundle;
  sectorAnalysis?: SectorAnalysisResult;
  ownedSymbols?: string[];
}) {
  const [mainTab, setMainTab] = useState<MainTab>("portfolio");
  const [subTab, setSubTab] = useState<SubTab>("fundamental");
  const [selection, setSelection] = useState<Selection | null>(null);
  const owned = new Set((ownedSymbols ?? []).map((s) => s.toUpperCase()));

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

  const selectedSymbol = selection?.row.symbol.toUpperCase() ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--bg-secondary)] p-1 ring-1 ring-[var(--border)]">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setMainTab(t.id);
              setSelection(null);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mainTab === t.id ? "bg-accent text-white" : "text-muted hover:text-[var(--fg)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab !== "rules" && mainTab !== "sector" && (
        <div className="flex flex-wrap gap-1">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setSubTab(t.id);
                setSelection(null);
              }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 ring-[var(--border)] ${
                subTab === t.id ? "bg-[var(--accent-bg)] text-accent" : "text-muted"
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

      <Card className="!p-4">
        {mainTab === "sector" && sectorAnalysis ? (
          <SectorAnalysisView data={sectorAnalysis} />
        ) : (
          <>
            <CardTitle className="!mb-1 !text-base">
              {MAIN_TABS.find((t) => t.id === mainTab)?.label}
              {mainTab !== "rules" && ` — ${SUB_TABS.find((t) => t.id === subTab)?.label}`}
            </CardTitle>
            {mainTab !== "rules" && bundle && (
              <p className="mb-3 text-xs text-muted">
                {description} · Click a row for analysis detail · Click symbol for stock page
              </p>
            )}
            <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
              {mainTab === "rules" ? (
                <div className="p-2">
                  <RulesPanel />
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
        )}
      </Card>
    </div>
  );
}

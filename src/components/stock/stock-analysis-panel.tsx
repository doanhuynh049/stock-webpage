import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { StockAnalysisResult } from "@/lib/analysis/stock-analysis";

function recVariant(rec: string): "success" | "danger" | "warning" | "info" | "default" {
  const u = rec.toUpperCase();
  if (u === "ACCUMULATE" || u === "BUY" || u === "STRONG_BUY") return "success";
  if (u === "SELL" || u === "AVOID") return "danger";
  if (u === "TRIM") return "warning";
  if (u === "WATCH") return "info";
  return "default";
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 75 ? "bg-emerald-500" : score >= 60 ? "bg-cyan-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold text-[var(--fg)]">{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function StockAnalysisPanel({ analysis }: { analysis: StockAnalysisResult }) {
  return (
    <Card className="!p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="!text-base">Stock Analysis</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={recVariant(analysis.recommendation)} className="text-xs">
            {analysis.recommendation}
          </Badge>
          <span className="text-[10px] text-subtle">via {analysis.source}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <ScoreBar label={`Technical (${analysis.technicalRating})`} score={analysis.technicalScore} />
          <ScoreBar label={`Fundamental (${analysis.fundamentalRating})`} score={analysis.fundamentalScore} />
          <ScoreBar label="Combined" score={analysis.combinedScore} />
        </div>
        <div className="space-y-2 text-xs text-muted">
          <p><span className="font-semibold text-subtle">Trend:</span> {analysis.maTrend}</p>
          <p><span className="font-semibold text-subtle">Momentum:</span> {analysis.momentum}</p>
          <p><span className="font-semibold text-subtle">Levels:</span> {analysis.supportResistance}</p>
        </div>
      </div>
    </Card>
  );
}

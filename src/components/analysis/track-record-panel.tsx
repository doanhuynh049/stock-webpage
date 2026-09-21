"use client";

/**
 * Realized track record for the /analysis Combined signals.
 *
 * Renders on the Scoring Rules tab, directly above the rules themselves — the
 * rules say what the app claims; this says whether the claim has held up.
 *
 * Deliberate display rules:
 *  - A null hit-rate renders as "—", never 0%. "Not measured yet" and "never
 *    right" are different claims; collapsing them would repeat the same class
 *    of bug as scoring a data-less stock 50/"Fair".
 *  - Sample size sits next to every percentage. A 100% hit-rate on n=2 is
 *    noise, and showing the number is the cheapest way to say so.
 *  - HOLD/WATCH show an explicit "not directional" note rather than a blank
 *    cell, so the exclusion reads as a decision and not missing data.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  SignalAccuracyReport,
  SignalAccuracyRow,
} from "@/lib/db/recommendation-outcomes";

function hitRateColor(pct: number | null): string {
  if (pct == null) return "text-subtle";
  if (pct >= 60) return "text-[var(--success)]";
  if (pct >= 45) return "text-[var(--warning)]";
  return "text-[var(--danger)]";
}

function returnColor(pct: number | null): string {
  if (pct == null) return "text-subtle";
  return pct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]";
}

function HorizonGroup({ horizon, rows }: { horizon: number; rows: SignalAccuracyRow[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-medium text-accent">{horizon}-day horizon</p>
      <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="bg-[var(--bg-secondary)] text-[10px] uppercase text-subtle">
            <tr>
              <th className="px-2 py-1.5 text-left">Signal</th>
              <th className="px-2 py-1.5 text-center">Hit rate</th>
              <th className="px-2 py-1.5 text-center">Scored</th>
              <th className="px-2 py-1.5 text-center">Avg return</th>
              <th className="px-2 py-1.5 text-center">Sample</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.recommendation} className="border-t border-[var(--border)]">
                <td className="px-2 py-1.5 font-medium">{r.recommendation}</td>
                <td className={`px-2 py-1.5 text-center font-mono ${hitRateColor(r.hitRatePct)}`}>
                  {r.hitRatePct != null ? `${r.hitRatePct}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-subtle">
                  {r.direction === "neutral" ? (
                    <span title="HOLD/WATCH express no action, so they have no direction to be right or wrong about.">
                      not directional
                    </span>
                  ) : (
                    `${r.hits}/${r.scored}`
                  )}
                </td>
                <td className={`px-2 py-1.5 text-center font-mono ${returnColor(r.avgReturnPct)}`}>
                  {r.avgReturnPct != null ? `${r.avgReturnPct > 0 ? "+" : ""}${r.avgReturnPct}%` : "—"}
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-subtle">n={r.sampleSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TrackRecordPanel() {
  const [report, setReport] = useState<SignalAccuracyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/analysis/outcomes")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SignalAccuracyReport | null) => {
        if (!cancelled) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section>
        <h3 className="mb-2 font-semibold">Track record</h3>
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <Loader2 className="h-3 w-3 animate-spin text-accent" />
          Loading realized outcomes…
        </p>
      </section>
    );
  }

  const horizons = [...new Set((report?.rows ?? []).map((r) => r.horizon))].sort((a, b) => a - b);

  return (
    <section>
      <h3 className="mb-1 font-semibold">Track record</h3>
      <p className="mb-3 text-xs text-muted">
        Realized outcomes for the Combined tab&apos;s signals, scored against the actual close
        price at each horizon. Everything below this section describes what the app{" "}
        <em>intends</em>; this section is whether it has worked.
      </p>

      {!report || report.isEmpty ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <p className="text-xs text-muted">
            No matured outcomes yet.{" "}
            {report && report.totalRecorded > 0
              ? `${report.totalRecorded} signal${report.totalRecorded === 1 ? "" : "s"} recorded — the first 30-day results appear 30 days after the first recording.`
              : "Signals are recorded daily; the first 30-day results appear 30 days after the first recording."}
          </p>
          <p className="mt-1 text-[10px] text-subtle">
            Until this table fills in, every weight in this app — the 0.60/0.40 Combined split
            included — is an untested assumption.
          </p>
        </div>
      ) : (
        <>
          {horizons.map((h) => (
            <HorizonGroup
              key={h}
              horizon={h}
              rows={(report.rows ?? []).filter((r) => r.horizon === h)}
            />
          ))}
          <p className="text-[10px] text-subtle">
            {report.totalRecorded} signals recorded
            {report.oldestRecordedAt
              ? ` since ${new Date(report.oldestRecordedAt).toLocaleDateString("vi-VN")}`
              : ""}
            . Hit = directionally correct vs. a flat price (bullish signals need a gain, bearish
            need a loss). Returns are absolute, not benchmark-relative — a +3% ACCUMULATE in a
            +8% market counts as a hit here.
          </p>
        </>
      )}
    </section>
  );
}

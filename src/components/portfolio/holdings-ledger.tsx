"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import {
  formatPortfolioAmount,
  formatPortfolioPercent,
  changeColor,
} from "@/lib/utils";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

type Draft = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  shares: number;
  avgBuyPrice: number;
  target3Month: number;
  targetLongTerm: number;
};

function toDraft(h: EnrichedHolding): Draft {
  return {
    symbol: h.symbol,
    name: h.name ?? "",
    exchange: h.exchange ?? "HOSE",
    sector: h.sector ?? "",
    shares: h.shares,
    avgBuyPrice: h.avgBuyPrice,
    target3Month: h.target3Month ?? 0,
    targetLongTerm: h.targetLongTerm ?? 0,
  };
}

function emptyDraft(): Draft {
  return {
    symbol: "",
    name: "",
    exchange: "HOSE",
    sector: "",
    shares: 0,
    avgBuyPrice: 0,
    target3Month: 0,
    targetLongTerm: 0,
  };
}

async function syncHoldings(
  rows: Draft[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/portfolio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      rows.map((r) => ({
        symbol: r.symbol.toUpperCase(),
        name: r.name || null,
        exchange: r.exchange || null,
        sector: r.sector || null,
        industry: null,
        platform: null,
        shares: Number(r.shares),
        avgBuyPrice: Number(r.avgBuyPrice),
        target3Month: r.target3Month || null,
        targetLongTerm: r.targetLongTerm || null,
      })),
    ),
  });
  const text = await res.text();
  if (!text.trim()) return { ok: false, error: "Empty response from server" };
  const data = JSON.parse(text) as { success?: boolean; error?: string };
  if (!res.ok || !data.success) {
    return { ok: false, error: data.error ?? "Sync failed" };
  }
  return { ok: true };
}

function EditModal({
  mode,
  draft,
  busy,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "add" | "edit";
  draft: Draft;
  busy: boolean;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const fields = [
    ["symbol", "Symbol", mode === "edit"],
    ["name", "Name"],
    ["exchange", "Exchange"],
    ["sector", "Sector"],
    ["shares", "Shares", false, "number"],
    ["avgBuyPrice", "Avg price", false, "number"],
    ["target3Month", "3M target", false, "number"],
    ["targetLongTerm", "LT target", false, "number"],
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {mode === "add" ? "Add holding" : `Edit ${draft.symbol}`}
          </h3>
          <button type="button" onClick={onClose} className="text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map(([key, label, readOnly, type]) => (
            <label key={key} className="text-xs">
              <span className="text-subtle">{label}</span>
              <input
                type={type ?? "text"}
                readOnly={readOnly === true}
                disabled={busy}
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 font-mono text-sm disabled:opacity-60"
                value={String(draft[key as keyof Draft] ?? "")}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    [key]:
                      type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-subtle">Saves directly to Neon portfolio_holding.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save to DB"}
          </button>
          <button type="button" onClick={onClose} className="text-xs text-muted">
            Cancel
          </button>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-danger ring-1 ring-danger/30 hover:bg-danger/10 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete holding
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HoldingsLedger({
  initialHoldings,
  totalCostBasis,
}: {
  userId: string;
  initialHoldings: EnrichedHolding[];
  totalCostBasis: number;
}) {
  const router = useRouter();
  const [holdings, setHoldings] = useState(initialHoldings);

  useEffect(() => {
    setHoldings(initialHoldings);
  }, [initialHoldings]);

  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = holdings.map(toDraft);

  const persist = useCallback(
    async (next: Draft[]) => {
      setBusy(true);
      setMessage(null);
      const result = await syncHoldings(next);
      setBusy(false);
      if (!result.ok) {
        setMessage(result.error ?? "Save failed");
        return false;
      }
      router.refresh();
      return true;
    },
    [router],
  );

  async function deleteModal() {
    const sym = draft.symbol.toUpperCase().trim();
    if (!sym) return;
    const next = rows.filter((r) => r.symbol.toUpperCase() !== sym);
    const ok = await persist(next);
    if (ok) {
      setModal(null);
      setDraft(emptyDraft());
    }
  }

  async function saveModal() {
    const sym = draft.symbol.toUpperCase().trim();
    if (!sym || draft.shares <= 0 || draft.avgBuyPrice <= 0) {
      setMessage("Symbol, shares, and avg price are required");
      return;
    }
    const next = rows.filter((r) => r.symbol.toUpperCase() !== sym);
    next.push({ ...draft, symbol: sym });
    next.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const ok = await persist(next);
    if (ok) {
      setModal(null);
      setDraft(emptyDraft());
    }
  }

  const totalCurrent = holdings.reduce((s, h) => s + (h.currentValueK ?? 0), 0);
  const totalGain = holdings.reduce((s, h) => s + (h.gainLossK ?? 0), 0);
  const hasLive = holdings.some((h) => h.currentPriceK != null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(emptyDraft());
            setModal("add");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add holding
        </button>
        <span className="text-[10px] text-subtle">Click a row to edit · auto-syncs to DB</span>
        {message && <p className="text-xs text-danger">{message}</p>}
      </div>

      {modal && (
        <EditModal
          mode={modal}
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onClose={() => setModal(null)}
          onSave={() => void saveModal()}
          onDelete={modal === "edit" ? () => void deleteModal() : undefined}
        />
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] font-semibold uppercase tracking-wider text-subtle">
              <th className="px-2 py-2">Symbol</th>
              <th className="px-2 py-2">Exch</th>
              <th className="px-2 py-2">Sector</th>
              <th className="px-2 py-2 text-right">Shares</th>
              <th className="px-2 py-2 text-right">Avg</th>
              <th className="px-2 py-2 text-right">Cost</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Value</th>
              <th className="px-2 py-2 text-right">P/L</th>
              <th className="px-2 py-2 text-right">%</th>
              <th className="px-2 py-2 text-center">3M prog</th>
              <th className="px-2 py-2 text-right">3M tgt</th>
              <th className="px-2 py-2 text-right">LT tgt</th>
              <th className="px-2 py-2 text-right">Wt%</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const weight =
                totalCostBasis > 0 ? (h.costBasis / totalCostBasis) * 100 : 0;
              return (
                <tr
                  key={h.id}
                  onClick={() => {
                    setDraft(toDraft(h));
                    setModal("edit");
                  }}
                  className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]"
                >
                  <td className="px-2 py-1.5">
                    <Link
                      href={`/stocks/${h.symbol}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-accent"
                    >
                      {h.symbol}
                    </Link>
                    <div className="max-w-[120px] truncate text-[10px] text-muted">{h.name ?? "—"}</div>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted">{h.exchange ?? "—"}</td>
                  <td className="max-w-[100px] truncate px-2 py-1.5 text-xs text-muted">{h.sector ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{h.shares.toLocaleString("vi-VN")}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{formatPortfolioAmount(h.avgBuyPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums font-medium">{formatPortfolioAmount(h.costBasis, 0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {h.currentPriceK != null ? formatPortfolioAmount(h.currentPriceK) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {h.currentValueK != null ? formatPortfolioAmount(h.currentValueK, 0) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${h.gainLossK != null ? changeColor(h.gainLossK) : "text-subtle"}`}>
                    {h.gainLossK != null ? `${h.gainLossK >= 0 ? "+" : ""}${formatPortfolioAmount(h.gainLossK, 0)}` : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${h.gainPct != null ? changeColor(h.gainPct) : "text-subtle"}`}>
                    {h.gainPct != null ? formatPortfolioPercent(h.gainPct) : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {h.toTargetPct != null ? (
                      <div className="mx-auto w-12">
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                          <div
                            className={`h-full ${(h.gainPct ?? 0) < 0 ? "bg-danger" : "bg-success"}`}
                            style={{ width: `${h.toTargetPct}%` }}
                          />
                        </div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {h.target3Month && h.target3Month > 0 ? formatPortfolioAmount(h.target3Month) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {h.targetLongTerm && h.targetLongTerm > 0 ? formatPortfolioAmount(h.targetLongTerm) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-subtle">{weight.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
          {holdings.length > 0 && (
            <tfoot>
              <tr className="bg-[var(--bg-secondary)] text-xs font-semibold">
                <td colSpan={5} className="px-2 py-2 text-right text-subtle">Totals</td>
                <td className="px-2 py-2 text-right font-mono">{formatPortfolioAmount(totalCostBasis, 0)}</td>
                <td />
                <td className="px-2 py-2 text-right font-mono">{hasLive ? formatPortfolioAmount(totalCurrent, 0) : "—"}</td>
                <td className={`px-2 py-2 text-right font-mono ${hasLive ? changeColor(totalGain) : ""}`}>
                  {hasLive ? `${totalGain >= 0 ? "+" : ""}${formatPortfolioAmount(totalGain, 0)}` : "—"}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

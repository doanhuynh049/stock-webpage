"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { FormModal, ModalCheckbox, modalFieldClass, modalLabelClass } from "@/components/ui/form-modal";
import {
  formatPortfolioAmount,
  formatPortfolioPercent,
  changeColor,
} from "@/lib/utils";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

type SortKey =
  | "symbol"
  | "exchange"
  | "sector"
  | "shares"
  | "avgBuyPrice"
  | "costBasis"
  | "currentPriceK"
  | "currentValueK"
  | "gainLossK"
  | "gainPct"
  | "toTargetPct"
  | "target3Month"
  | "targetLongTerm"
  | "weight";

type SortDir = "asc" | "desc";

type Draft = {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  shares: number;
  avgBuyPrice: number;
  target3Month: number | null;
  targetLongTerm: number | null;
};

function sortHoldings(
  rows: EnrichedHolding[],
  key: SortKey,
  dir: SortDir,
  totalCostBasis: number,
): EnrichedHolding[] {
  const mul = dir === "asc" ? 1 : -1;
  const num = (v: number | null | undefined, fallback = -Infinity) =>
    v ?? fallback;

  return [...rows].sort((a, b) => {
    switch (key) {
      case "symbol":
        return mul * a.symbol.localeCompare(b.symbol);
      case "exchange":
        return mul * (a.exchange ?? "").localeCompare(b.exchange ?? "");
      case "sector":
        return mul * (a.sector ?? "").localeCompare(b.sector ?? "");
      case "shares":
        return mul * (a.shares - b.shares);
      case "avgBuyPrice":
        return mul * (a.avgBuyPrice - b.avgBuyPrice);
      case "costBasis":
        return mul * (a.costBasis - b.costBasis);
      case "currentPriceK":
        return mul * (num(a.currentPriceK) - num(b.currentPriceK));
      case "currentValueK":
        return mul * (num(a.currentValueK) - num(b.currentValueK));
      case "gainLossK":
        return mul * (num(a.gainLossK) - num(b.gainLossK));
      case "gainPct":
        return mul * (num(a.gainPct) - num(b.gainPct));
      case "toTargetPct":
        return mul * (num(a.toTargetPct) - num(b.toTargetPct));
      case "target3Month":
        return mul * (num(a.target3Month, 0) - num(b.target3Month, 0));
      case "targetLongTerm":
        return mul * (num(a.targetLongTerm, 0) - num(b.targetLongTerm, 0));
      case "weight": {
        const wa = totalCostBasis > 0 ? a.costBasis / totalCostBasis : 0;
        const wb = totalCostBasis > 0 ? b.costBasis / totalCostBasis : 0;
        return mul * (wa - wb);
      }
      default:
        return 0;
    }
  });
}

function SortHeader({
  label,
  column,
  active,
  dir,
  align = "left",
  onSort,
}: {
  label: string;
  column: SortKey;
  active: SortKey;
  dir: SortDir;
  align?: "left" | "right" | "center";
  onSort: (col: SortKey) => void;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-2 py-2 ${alignClass}`}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 uppercase hover:text-[var(--fg)]"
        onClick={() => onSort(column)}
      >
        {label}
        {active === column && (
          <span className="text-accent">{dir === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );
}

function toDraft(h: EnrichedHolding): Draft {
  return {
    symbol: h.symbol,
    name: h.name ?? "",
    exchange: h.exchange ?? "HOSE",
    sector: h.sector ?? "",
    shares: h.shares,
    avgBuyPrice: h.avgBuyPrice,
    target3Month: h.target3Month ?? null,
    targetLongTerm: h.targetLongTerm ?? null,
  };
}

function draftToEnriched(d: Draft, existing?: EnrichedHolding): EnrichedHolding {
  const sym = d.symbol.toUpperCase();
  const costBasis = d.shares * d.avgBuyPrice;
  return {
    id: existing?.id ?? `temp-${sym}`,
    symbol: sym,
    name: d.name || null,
    exchange: d.exchange || null,
    sector: d.sector || null,
    industry: existing?.industry ?? null,
    shares: d.shares,
    avgBuyPrice: d.avgBuyPrice,
    costBasis,
    target3Month: d.target3Month || null,
    targetLongTerm: d.targetLongTerm || null,
    targetSetDate: existing?.targetSetDate ?? null,
    platform: existing?.platform ?? null,
    currentPriceK: existing?.currentPriceK ?? null,
    currentValueK: existing?.currentValueK ?? null,
    gainLossK: existing?.gainLossK ?? null,
    gainPct: existing?.gainPct ?? null,
    toTargetPct: existing?.toTargetPct ?? null,
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
    target3Month: null,
    targetLongTerm: null,
  };
}

function draftsToEnriched(rows: Draft[], prev: EnrichedHolding[]): EnrichedHolding[] {
  const prevBySym = new Map(prev.map((h) => [h.symbol.toUpperCase(), h]));
  return rows
    .map((r) => draftToEnriched(r, prevBySym.get(r.symbol.toUpperCase())))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
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
  addAnother,
  onAddAnotherChange,
  onChange,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "add" | "edit";
  draft: Draft;
  busy: boolean;
  addAnother: boolean;
  onAddAnotherChange: (checked: boolean) => void;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  // Track raw string inputs for numeric fields so users can type decimals like "31.08"
  const [rawInputs, setRawInputs] = useState<Partial<Record<string, string>>>({});
  const draftKey = useRef(draft.symbol + mode);
  useEffect(() => {
    const key = draft.symbol + mode;
    if (key !== draftKey.current) {
      draftKey.current = key;
      setRawInputs({});
    }
  }, [draft.symbol, mode]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave();
  }

  return (
    <FormModal
      open
      title={mode === "add" ? "Add holding" : `Edit ${draft.symbol}`}
      subtitle={
        mode === "add"
          ? "Adds a row to your Neon portfolio holdings."
          : "Updates sync to the database immediately."
      }
      onClose={onClose}
      options={
        mode === "add" ? (
          <ModalCheckbox
            id="holding-add-another"
            checked={addAnother}
            onChange={onAddAnotherChange}
            label="Add another"
            description="Keep this dialog open for the next position."
          />
        ) : undefined
      }
      footer={
        <>
          <button
            type="submit"
            form="edit-holding-form"
            disabled={busy}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm hover:opacity-90 disabled:opacity-50 sm:flex-none"
          >
            {busy ? "Saving…" : mode === "add" ? "Save holding" : "Save changes"}
          </button>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-muted">
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
        </>
      }
    >
      <form id="edit-holding-form" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([key, label, readOnly, type]) => {
            const rawVal = draft[key as keyof Draft];
            const isTargetField = key === "target3Month" || key === "targetLongTerm";
            const isNumeric = type === "number";
            // Use raw string when user is actively typing; fall back to stored value
            const displayVal =
              isNumeric && rawInputs[key] !== undefined
                ? rawInputs[key]!
                : isTargetField
                  ? (rawVal == null || rawVal === 0 ? "" : String(rawVal))
                  : String(rawVal ?? "");
            return (
              <label key={key} className="block">
                <span className={modalLabelClass}>{label}</span>
                <input
                  type="text"
                  inputMode={isNumeric ? "decimal" : undefined}
                  readOnly={readOnly === true}
                  disabled={busy}
                  className={`${modalFieldClass} font-mono disabled:opacity-60`}
                  value={displayVal}
                  placeholder={isTargetField ? "e.g. 85 (= 85,000 ₫)" : undefined}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (isNumeric) {
                      setRawInputs((prev) => ({ ...prev, [key]: raw }));
                      const parsed = raw === "" ? null : parseFloat(raw);
                      const value = parsed == null || isNaN(parsed)
                        ? (isTargetField ? null : 0)
                        : parsed;
                      onChange({ ...draft, [key]: value });
                    } else {
                      onChange({ ...draft, [key]: raw });
                    }
                  }}
                  onBlur={() => {
                    if (isNumeric) {
                      // Clear raw input on blur so display normalizes to stored value
                      setRawInputs((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      });
                    }
                  }}
                />
              </label>
            );
          })}
        </div>
      </form>
    </FormModal>
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
  const [addAnother, setAddAnother] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("costBasis");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  }

  const sortedHoldings = useMemo(
    () => sortHoldings(holdings, sortKey, sortDir, totalCostBasis),
    [holdings, sortKey, sortDir, totalCostBasis],
  );

  const rows = sortedHoldings.map(toDraft);

  const persist = useCallback(
    (next: Draft[], prevHoldings: EnrichedHolding[]) => {
      setHoldings(draftsToEnriched(next, prevHoldings));
      setMessage(null);

      void (async () => {
        const result = await syncHoldings(next);
        if (!result.ok) {
          setHoldings(prevHoldings);
          setMessage(result.error ?? "Save failed");
          return;
        }
        router.refresh();
      })();

      return true;
    },
    [router],
  );

  function deleteModal() {
    const sym = draft.symbol.toUpperCase().trim();
    if (!sym) return;
    const next = rows.filter((r) => r.symbol.toUpperCase() !== sym);
    persist(next, holdings);
    setModal(null);
    setDraft(emptyDraft());
  }

  function saveModal() {
    const sym = draft.symbol.toUpperCase().trim();
    if (!sym || draft.shares <= 0 || draft.avgBuyPrice <= 0) {
      setMessage("Symbol, shares, and avg price are required");
      return;
    }
    const next = rows.filter((r) => r.symbol.toUpperCase() !== sym);
    next.push({ ...draft, symbol: sym });
    next.sort((a, b) => a.symbol.localeCompare(b.symbol));
    persist(next, holdings);
    const keepOpen = addAnother && modal === "add";
    if (keepOpen) {
      setDraft(emptyDraft());
      setModal("add");
    } else {
      setModal(null);
      setDraft(emptyDraft());
      setAddAnother(false);
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
          onClick={() => {
            setDraft(emptyDraft());
            setAddAnother(false);
            setModal("add");
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
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
          busy={false}
          addAnother={addAnother}
          onAddAnotherChange={setAddAnother}
          onChange={setDraft}
          onClose={() => {
            setModal(null);
            setAddAnother(false);
          }}
          onSave={saveModal}
          onDelete={modal === "edit" ? () => void deleteModal() : undefined}
        />
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] font-semibold uppercase tracking-wider text-subtle">
              <SortHeader label="Symbol" column="symbol" active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Exch" column="exchange" active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Sector" column="sector" active={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="Shares" column="shares" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="Avg" column="avgBuyPrice" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="Cost" column="costBasis" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="Price" column="currentPriceK" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="Value" column="currentValueK" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="P/L" column="gainLossK" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="%" column="gainPct" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="3M prog" column="toTargetPct" active={sortKey} dir={sortDir} align="center" onSort={handleSort} />
              <SortHeader label="3M tgt" column="target3Month" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="LT tgt" column="targetLongTerm" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
              <SortHeader label="Wt%" column="weight" active={sortKey} dir={sortDir} align="right" onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((h) => {
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
                    <div className="flex items-center gap-2">
                      <StockAvatar symbol={h.symbol} sector={h.sector ?? undefined} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/stocks/${h.symbol}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-accent"
                        >
                          {h.symbol}
                        </Link>
                        <div className="max-w-[120px] truncate text-[10px] text-muted">{h.name ?? "—"}</div>
                      </div>
                    </div>
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

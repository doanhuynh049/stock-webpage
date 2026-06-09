"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  FormModal,
  ModalCheckbox,
  modalFieldClass,
  modalLabelClass,
} from "@/components/ui/form-modal";
import { StatCard } from "@/components/ui/stat-card";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import {
  formatPortfolioAmount,
  formatPortfolioPercent,
  changeColor,
} from "@/lib/utils";
import type { TradeRecord, TradeSummary, TradeType } from "@/lib/db/trading-types";
import {
  readTradingCache,
  writeTradingCache,
} from "@/lib/client/trading-cache";

type TradeForm = {
  transactionDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  transactionType: TradeType;
  fee: number;
  profit: number;
  exchange: string;
  sector: string;
};

const emptyForm: TradeForm = {
  transactionDate: new Date().toISOString().slice(0, 10),
  itemName: "",
  quantity: 0,
  unitPrice: 0,
  transactionType: "BUY",
  fee: 0,
  profit: 0,
  exchange: "",
  sector: "",
};

export function TradingLedger() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({ year: "", month: "", type: "", symbol: "" });
  const cachedInitial = readTradingCache(filters);

  const [trades, setTrades] = useState<TradeRecord[]>(() => cachedInitial?.trades ?? []);
  type SortKey = "date" | "type" | "symbol" | "qty" | "price" | "total" | "vsNow" | "profit" | "exchange";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("date", "desc");
  const [summary, setSummary] = useState<TradeSummary | null>(() => cachedInitial?.summary ?? null);
  const [prices, setPrices] = useState<Record<string, number>>(() => cachedInitial?.prices ?? {});
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TradeForm>(emptyForm);
  const [addAnother, setAddAnother] = useState(false);
  const [symbolLookup, setSymbolLookup] = useState(false);
  const [loading, setLoading] = useState(() => !cachedInitial);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else if (!readTradingCache(filters)) {
        setLoading(true);
      }
      try {
        const q = new URLSearchParams();
        if (filters.year) q.set("year", filters.year);
        if (filters.month) q.set("month", filters.month);
        if (filters.type) q.set("type", filters.type);
        if (filters.symbol) q.set("symbol", filters.symbol.toUpperCase());
        const res = await fetch(`/api/trading?${q}`);
        const text = await res.text();
        if (!text.trim()) {
          setTrades([]);
          setSummary(null);
          setPrices({});
          return;
        }
        let data: {
          trades?: TradeRecord[];
          summary?: TradeSummary;
          currentPrices?: Record<string, number>;
          error?: string;
        };
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          console.error("[trading] invalid JSON:", text.slice(0, 200));
          return;
        }
        if (!res.ok && !data.trades) {
          console.error("[trading] API error:", data.error);
          return;
        }
        const nextTrades = data.trades ?? [];
        const nextSummary = data.summary ?? null;
        const nextPrices = data.currentPrices ?? {};
        setTrades(nextTrades);
        setSummary(nextSummary);
        setPrices(nextPrices);
        writeTradingCache(filters, {
          trades: nextTrades,
          summary: nextSummary,
          prices: nextPrices,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const cached = readTradingCache(filters);
    if (cached) {
      setTrades(cached.trades);
      setSummary(cached.summary);
      setPrices(cached.prices);
      setLoading(false);
      void load(true);
    } else {
      void load(false);
    }
  }, [load, filters]);

  useEffect(() => {
    const add = searchParams.get("add");
    const sym = searchParams.get("symbol")?.toUpperCase();
    if (add !== "1" && !sym) return;

    const price = Number(searchParams.get("price"));
    setForm({
      ...emptyForm,
      itemName: sym ?? "",
      unitPrice: Number.isFinite(price) && price > 0 ? price : 0,
      exchange: searchParams.get("exchange") ?? "",
      sector: searchParams.get("sector") ?? "",
    });
    setEditId(null);
    setFormOpen(true);
  }, [searchParams]);

  useEffect(() => {
    const sym = form.itemName.trim().toUpperCase();
    if (sym.length < 2 || editId) return;

    let cancelled = false;
    setSymbolLookup(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/stocks/${sym}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { stock?: { sector?: string; exchange?: string; price?: number } } | null) => {
          if (cancelled || !data?.stock) return;
          setForm((current) => ({
            ...current,
            sector: data.stock!.sector ?? current.sector,
            exchange: data.stock!.exchange ?? current.exchange,
            unitPrice:
              current.unitPrice > 0
                ? current.unitPrice
                : data.stock!.price ?? current.unitPrice,
          }));
        })
        .finally(() => {
          if (!cancelled) setSymbolLookup(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setSymbolLookup(false);
    };
  }, [form.itemName, editId]);

  const sortedTrades = useMemo(() => {
    if (!sortKey) return trades;
    return [...trades].sort((a, b) => {
      const nowA = prices[a.itemName];
      const nowB = prices[b.itemName];
      const vsNowA =
        nowA != null && a.unitPrice > 0 ? ((nowA - a.unitPrice) / a.unitPrice) * 100 : null;
      const vsNowB =
        nowB != null && b.unitPrice > 0 ? ((nowB - b.unitPrice) / b.unitPrice) * 100 : null;

      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = compareStrings(a.transactionDate, b.transactionDate);
          break;
        case "type":
          cmp = compareStrings(a.transactionType, b.transactionType);
          break;
        case "symbol":
          cmp = compareStrings(a.itemName, b.itemName);
          break;
        case "qty":
          cmp = compareNumbers(a.quantity, b.quantity);
          break;
        case "price":
          cmp = compareNumbers(a.unitPrice, b.unitPrice);
          break;
        case "total":
          cmp = compareNumbers(a.totalAmount, b.totalAmount);
          break;
        case "vsNow":
          cmp = compareNumbers(vsNowA, vsNowB);
          break;
        case "profit":
          cmp = compareNumbers(a.profit, b.profit);
          break;
        case "exchange":
          cmp = compareStrings(a.exchange, b.exchange);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [trades, sortKey, sortDir, prices]);

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setAddAnother(false);
    setForm(emptyForm);
  }

  function saveTrade(e: FormEvent) {
    e.preventDefault();
    const keepOpen = addAnother && !editId;
    const payload = {
      ...form,
      itemName: form.itemName.toUpperCase(),
      transactionType: form.transactionType,
      profit: form.transactionType === "SELL" ? form.profit : null,
    };
    const url = editId ? `/api/trading/${editId}` : "/api/trading";
    const method = editId ? "PUT" : "POST";

    const prevTrades = trades;
    const tempId = editId ?? `temp-${Date.now()}`;
    const optimistic: TradeRecord = {
      id: tempId,
      userId: "",
      transactionDate: payload.transactionDate,
      itemName: payload.itemName,
      quantity: payload.quantity,
      unitPrice: payload.unitPrice,
      totalAmount: payload.quantity * payload.unitPrice,
      fee: payload.fee ?? 0,
      tax: 0,
      profit: payload.profit ?? null,
      transactionType: payload.transactionType,
      exchange: payload.exchange || null,
      sector: payload.sector || null,
    };

    setTrades((current) =>
      editId
        ? current.map((t) => (t.id === editId ? optimistic : t))
        : [...current, optimistic],
    );

    if (keepOpen) {
      setForm({
        ...emptyForm,
        transactionDate: form.transactionDate,
        transactionType: form.transactionType,
      });
    } else {
      closeForm();
    }

    void (async () => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setTrades(prevTrades);
        return;
      }
      void load(true);
    })();
  }

  function remove(id: string) {
    if (!confirm("Delete this trade? Portfolio will rebuild automatically.")) return;
    const prevTrades = trades;
    setTrades((current) => current.filter((t) => t.id !== id));

    void (async () => {
      const res = await fetch(`/api/trading/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTrades(prevTrades);
        return;
      }
      void load(true);
    })();
  }

  const tradeFormFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={modalLabelClass}>Symbol</span>
        <input
          required
          autoFocus={!editId}
          className={`${modalFieldClass} uppercase`}
          value={form.itemName}
          onChange={(e) => setForm({ ...form, itemName: e.target.value.toUpperCase() })}
          placeholder="FPT, VCB, ACB…"
        />
        {symbolLookup && (
          <span className="mt-1 block text-[10px] text-subtle">Looking up sector & exchange…</span>
        )}
      </label>
      <label className="block">
        <span className={modalLabelClass}>Date</span>
        <input
          type="date"
          required
          className={modalFieldClass}
          value={form.transactionDate}
          onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
        />
      </label>
      <label className="block">
        <span className={modalLabelClass}>Type</span>
        <select
          className={modalFieldClass}
          value={form.transactionType}
          onChange={(e) =>
            setForm({ ...form, transactionType: e.target.value as TradeType })
          }
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </label>
      <label className="block">
        <span className={modalLabelClass}>Quantity</span>
        <input
          type="number"
          required
          min={1}
          className={modalFieldClass}
          value={form.quantity || ""}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className={modalLabelClass}>Unit price</span>
        <input
          type="number"
          required
          min={0.01}
          step={0.01}
          className={modalFieldClass}
          value={form.unitPrice || ""}
          onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className={modalLabelClass}>Exchange</span>
        <input
          readOnly
          className={`${modalFieldClass} bg-[var(--bg-secondary)] text-muted`}
          value={form.exchange || "—"}
          tabIndex={-1}
        />
      </label>
      <label className="block">
        <span className={modalLabelClass}>Sector</span>
        <input
          readOnly
          className={`${modalFieldClass} bg-[var(--bg-secondary)] text-muted`}
          value={form.sector || "—"}
          tabIndex={-1}
        />
      </label>
      <label className="block">
        <span className={modalLabelClass}>Fee</span>
        <input
          type="number"
          className={modalFieldClass}
          value={form.fee || ""}
          onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
        />
      </label>
      {form.transactionType === "SELL" && (
        <label className="block sm:col-span-2">
          <span className={modalLabelClass}>Profit</span>
          <input
            type="number"
            className={modalFieldClass}
            value={form.profit || ""}
            onChange={(e) => setForm({ ...form, profit: Number(e.target.value) })}
          />
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Trades" value={String(summary.total)} accent="cyan" />
          <StatCard label="Buys" value={String(summary.buys)} accent="emerald" />
          <StatCard label="Sells" value={String(summary.sells)} accent="violet" />
          <StatCard
            label="Net P/L"
            value={formatPortfolioAmount(summary.totalProfit, 0)}
            accent="amber"
          />
          <StatCard
            label="Win rate"
            value={summary.winRate != null ? formatPortfolioPercent(summary.winRate, 0) : "—"}
            accent="emerald"
          />
          <StatCard
            label="Range"
            value={
              summary.firstDate && summary.lastDate
                ? `${summary.firstDate} → ${summary.lastDate}`
                : "—"
            }
            accent="cyan"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm);
            setEditId(null);
            setAddAnother(false);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add trade
        </button>
        <input
          placeholder="Year"
          className="w-20 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          value={filters.year}
          onChange={(e) => setFilters({ ...filters, year: e.target.value })}
        />
        <input
          placeholder="Month"
          className="w-16 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          value={filters.month}
          onChange={(e) => setFilters({ ...filters, month: e.target.value })}
        />
        <input
          placeholder="Symbol"
          className="w-24 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs uppercase"
          value={filters.symbol}
          onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}
        />
        <select
          className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">All</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
        </select>
      </div>

      <FormModal
        open={formOpen}
        title={editId ? "Edit trade" : "New trade"}
        subtitle={
          editId
            ? "Update this ledger row — portfolio rebuilds automatically."
            : "Log a BUY or SELL — sector & exchange fill from the ticker."
        }
        onClose={closeForm}
        options={
          !editId ? (
            <ModalCheckbox
              id="trade-add-another"
              checked={addAnother}
              onChange={setAddAnother}
              label="Add another after saving"
              description="Keep this dialog open for the next trade."
            />
          ) : undefined
        }
        footer={
          <>
            <button
              type="submit"
              form="trade-form"
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 sm:flex-none"
            >
              {editId ? "Save changes" : "Save trade"}
            </button>
            <button type="button" onClick={closeForm} className="px-3 py-2 text-sm text-muted">
              Cancel
            </button>
          </>
        }
      >
        <form id="trade-form" onSubmit={saveTrade}>
          {tradeFormFields}
        </form>
      </FormModal>

      {(trades.length > 0 || !loading) && (
        <p className="text-xs text-muted">
          Showing <span className="font-mono font-semibold text-[var(--fg)]">{trades.length}</span>{" "}
          trades
          {summary ? ` · ${summary.buys} buys · ${summary.sells} sells` : ""}
          {refreshing && <span className="ml-2 text-subtle">· refreshing…</span>}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-xl ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <SortableTableHeader label="Date" column="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-2" />
              <SortableTableHeader label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-2" />
              <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-2" />
              <SortableTableHeader label="Qty" column="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-2" />
              <SortableTableHeader label="Price" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-2" />
              <SortableTableHeader label="Total" column="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-2" />
              <SortableTableHeader label="vs Now" column="vsNow" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-2" />
              <SortableTableHeader label="Profit" column="profit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-2" />
              <SortableTableHeader label="Exch" column="exchange" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-2" />
              <th className="px-2 py-2 text-center"> </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-8 text-center text-muted">
                  No trades yet — add a BUY/SELL to build your portfolio.
                </td>
              </tr>
            ) : (
              sortedTrades.map((t, i) => {
                const now = prices[t.itemName];
                const vsNow =
                  now != null && t.unitPrice > 0
                    ? ((now - t.unitPrice) / t.unitPrice) * 100
                    : null;
                return (
                  <tr key={`${t.id}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
                    <td className="px-2 py-1.5 text-xs text-muted">{t.transactionDate}</td>
                    <td className="px-2 py-1.5">
                      <Badge variant={t.transactionType === "BUY" ? "success" : "danger"} className="text-[10px]">
                        {t.transactionType}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <StockAvatar symbol={t.itemName} sector={t.sector ?? undefined} size="sm" />
                        <span className="font-semibold">{t.itemName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{t.quantity}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatPortfolioAmount(t.unitPrice)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatPortfolioAmount(t.totalAmount, 0)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono text-xs ${vsNow != null ? changeColor(vsNow) : "text-subtle"}`}>
                      {vsNow != null ? formatPortfolioPercent(vsNow) : "—"}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono ${t.profit != null ? changeColor(t.profit) : "text-subtle"}`}>
                      {t.profit != null ? formatPortfolioAmount(t.profit, 0) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted">{t.exchange ?? "—"}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        className="rounded p-1 text-accent hover:bg-[var(--bg-secondary)]"
                        onClick={() => {
                          setEditId(t.id);
                          setForm({
                            transactionDate: t.transactionDate,
                            itemName: t.itemName,
                            quantity: t.quantity,
                            unitPrice: t.unitPrice,
                            transactionType: t.transactionType,
                            fee: t.fee,
                            profit: t.profit ?? 0,
                            exchange: t.exchange ?? "",
                            sector: t.sector ?? "",
                          });
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="ml-1 rounded p-1 text-danger hover:bg-[var(--bg-secondary)]"
                        onClick={() => remove(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

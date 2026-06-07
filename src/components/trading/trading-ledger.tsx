"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  formatPortfolioAmount,
  formatPortfolioPercent,
  changeColor,
} from "@/lib/utils";
import type { TradeRecord, TradeSummary, TradeType } from "@/lib/db/trading-types";

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
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [summary, setSummary] = useState<TradeSummary | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({ year: "", month: "", type: "", symbol: "" });
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TradeForm>(emptyForm);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
        setTrades([]);
        setSummary(null);
        setPrices({});
        return;
      }
      if (!res.ok && !data.trades) {
        console.error("[trading] API error:", data.error);
      }
      setTrades(data.trades ?? []);
      setSummary(data.summary ?? null);
      setPrices(data.currentPrices ?? {});
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTrade(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      itemName: form.itemName.toUpperCase(),
      transactionType: form.transactionType,
      profit: form.transactionType === "SELL" ? form.profit : null,
    };
    const url = editId ? `/api/trading/${editId}` : "/api/trading";
    const method = editId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    setForm(emptyForm);
    setEditId(null);
    setFormOpen(false);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this trade? Portfolio will rebuild automatically.")) return;
    await fetch(`/api/trading/${id}`, { method: "DELETE" });
    await load();
  }

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

      {formOpen && (
        <form
          onSubmit={saveTrade}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editId ? "Edit trade" : "New trade"}</h3>
            <button type="button" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4 text-muted" />
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-xs">
              <span className="text-subtle">Date</span>
              <input
                type="date"
                required
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                value={form.transactionDate}
                onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
              />
            </label>
            <label className="text-xs">
              <span className="text-subtle">Symbol</span>
              <input
                required
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm uppercase"
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
              />
            </label>
            <label className="text-xs">
              <span className="text-subtle">Type</span>
              <select
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                value={form.transactionType}
                onChange={(e) =>
                  setForm({ ...form, transactionType: e.target.value as TradeType })
                }
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="text-subtle">Quantity</span>
              <input
                type="number"
                required
                min={1}
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                value={form.quantity || ""}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs">
              <span className="text-subtle">Unit price</span>
              <input
                type="number"
                required
                min={0.01}
                step={0.01}
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs">
              <span className="text-subtle">Fee</span>
              <input
                type="number"
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                value={form.fee || ""}
                onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
              />
            </label>
            {form.transactionType === "SELL" && (
              <label className="text-xs">
                <span className="text-subtle">Profit</span>
                <input
                  type="number"
                  className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                  value={form.profit || ""}
                  onChange={(e) => setForm({ ...form, profit: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          <p className="mt-2 text-[10px] text-subtle">
            Saves to ledger and rebuilds portfolio holdings (shares = ΣBUY − ΣSELL).
          </p>
          <button type="submit" className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
            Save trade
          </button>
        </form>
      )}

      {!loading && trades.length > 0 && (
        <p className="text-xs text-muted">
          Showing <span className="font-mono font-semibold text-[var(--fg)]">{trades.length}</span>{" "}
          trades{summary ? ` · ${summary.buys} buys · ${summary.sells} sells` : ""}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-xl ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Symbol</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">vs Now</th>
              <th className="px-2 py-2 text-right">Profit</th>
              <th className="px-2 py-2">Exch</th>
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
              trades.map((t, i) => {
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
                    <td className="px-2 py-1.5 font-semibold">{t.itemName}</td>
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
                        onClick={() => void remove(t.id)}
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

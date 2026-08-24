"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  formatDateDMY,
  parseFormattedNumber,
  formatNumber,
  todayISO,
  changeColor,
} from "@/lib/utils";
import {
  summarizeTrades,
  type TradeRecord,
  type TradeSummary,
  type TradeType,
} from "@/lib/db/trading-types";
import {
  readTradingCache,
  writeTradingCache,
} from "@/lib/client/trading-cache";

/**
 * Display a full-VND price as a K-format string for the unit price input.
 * 74200 → "74,2"   (vi-VN locale: comma = decimal separator)
 * 10000 → "10"
 * 74250 → "74,25"
 */
function vndToKInput(vnd: number): string {
  if (!vnd || vnd <= 0) return "";
  const k = vnd / 1000;
  const decimals = k % 1 === 0 ? 0 : k * 10 % 1 === 0 ? 1 : 2;
  return formatNumber(k, decimals);
}

/**
 * Parse the unit price input. Values are stored in K (thousands of VND) throughout
 * the trading ledger, so no unit conversion is needed — just parse the locale-aware
 * number string as-is.
 *   "74,2"   → 74.2   "74.2"  → 74.2
 *   "74.200" → 74200  (dot-separated thousands → full K value for large prices)
 */
function parseUnitPriceToVnd(raw: string): number {
  return parseFormattedNumber(raw);
}

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

export function TradingLedger({ userId }: { userId?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filters, setFilters] = useState({ year: "", month: "", type: "", symbol: "", dateFrom: "", dateTo: "" });

  // Do NOT read localStorage in useState initializers — they run during SSR
  // and differ from the client, causing React hydration mismatches.
  // Instead, seed state from cache inside useEffect (client-only).
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  type SortKey = "date" | "type" | "symbol" | "qty" | "price" | "total" | "vsNow" | "profit" | "exchange";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("date", "desc");
  // Derive summary directly from trades so stat cards update instantly on
  // optimistic add/edit/remove — no wait for the background GET to complete.
  const summary: TradeSummary | null = useMemo(
    () => (trades.length > 0 ? summarizeTrades(trades) : null),
    [trades],
  );
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TradeForm>(emptyForm);
  const [addAnother, setAddAnother] = useState(false);
  const [, setDateInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [symbolLookup, setSymbolLookup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (background = false) => {
      if (background) {
        setRefreshing(true);
      } else if (!readTradingCache(filters, userId)) {
        setLoading(true);
      }
      try {
        const q = new URLSearchParams();
        if (filters.year) q.set("year", filters.year);
        if (filters.month) q.set("month", filters.month);
        if (filters.type) q.set("type", filters.type);
        if (filters.symbol) q.set("symbol", filters.symbol.toUpperCase());
        if (filters.dateFrom) q.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) q.set("dateTo", filters.dateTo);
        const res = await fetch(`/api/trading?${q}`, { cache: "no-store" });
        const text = await res.text();
        if (!text.trim()) {
          setTrades([]);
          setPrices({});
          return;
        }
        let data: {
          success?: boolean;
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
        // The GET handler returns HTTP 200 even on server errors (to avoid client-side
        // uncaught exceptions). Guard explicitly so we never wipe the optimistic list.
        if (!res.ok || data.success === false) {
          console.error("[trading] GET error:", data.error);
          return;
        }
        const nextTrades = data.trades ?? [];
        const nextPrices = data.currentPrices ?? {};
        setTrades(nextTrades);
        setPrices(nextPrices);
        writeTradingCache(filters, {
          trades: nextTrades,
          summary: data.summary ?? null,
          prices: nextPrices,
        }, userId);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, userId],
  );

  useEffect(() => {
    // localStorage cache is client-only (SSR always sees the `loading: true`
    // default) — must stay an effect so the first hydration render still
    // matches the server, then this swaps in the cached rows immediately.
    const cached = readTradingCache(filters, userId);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration cache hydrate, see comment above
      setTrades(cached.trades);
      setPrices(cached.prices);
      setLoading(false);
      void load(true);
    } else {
      void load(false);
    }
  }, [load, filters, userId]);

  useEffect(() => {
    const add = searchParams.get("add");
    const sym = searchParams.get("symbol")?.toUpperCase();
    if (add !== "1" && !sym) return;

    const priceVnd = Number(searchParams.get("price"));
    // LogTradeLink passes full VND; form stores K (÷1000)
    const priceK = Number.isFinite(priceVnd) && priceVnd > 0 ? priceVnd / 1000 : 0;
    openForm({
      ...emptyForm,
      itemName: sym ?? "",
      unitPrice: priceK,
      exchange: searchParams.get("exchange") ?? "",
      sector: searchParams.get("sector") ?? "",
    });
    // Strip URL params so a page reload doesn't re-open the form
    router.replace("/trading", { scroll: false });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sym = form.itemName.trim().toUpperCase();
    if (sym.length < 2 || editId) return;

    let cancelled = false;
    // Kicking off a debounced async lookup, not synchronizing rendered state
    // to a prop — the flag flips back off in the `.finally()` below.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional "start async op" flag, see comment above
    setSymbolLookup(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/stocks/${sym}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { stock?: { sector?: string; exchange?: string; price?: number } } | null) => {
          if (cancelled || !data?.stock) return;
          setForm((current) => {
            // API price is full VND; form stores K (÷1000)
            const priceK = data.stock!.price ? data.stock!.price / 1000 : 0;
            const nextPrice = current.unitPrice > 0 ? current.unitPrice : priceK;
            if (current.unitPrice <= 0 && priceK > 0) {
              setUnitPriceInput(vndToKInput(data.stock!.price!));
            }
            return {
              ...current,
              sector: data.stock!.sector ?? current.sector,
              exchange: data.stock!.exchange ?? current.exchange,
              unitPrice: nextPrice,
            };
          });
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

  function openForm(nextForm: TradeForm, editingId: string | null = null) {
    setForm(nextForm);
    setEditId(editingId);
    setDateInput(nextForm.transactionDate); // ISO yyyy-mm-dd for type="date"
    setUnitPriceInput(vndToKInput(nextForm.unitPrice * 1000)); // unitPrice is K; vndToKInput needs full VND
    setAddAnother(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setAddAnother(false);
    setDateInput("");
    setUnitPriceInput("");
    setForm(emptyForm);
  }

  function saveTrade(e: FormEvent) {
    e.preventDefault();
    if (!form.transactionDate) {
      alert("Enter a valid date.");
      return;
    }
    const tradeForm = { ...form };
    const keepOpen = addAnother && !editId;
    const payload = {
      ...tradeForm,
      itemName: tradeForm.itemName.toUpperCase(),
      transactionType: tradeForm.transactionType,
      profit: tradeForm.transactionType === "SELL" ? tradeForm.profit : null,
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
      const nextForm = {
        ...emptyForm,
        transactionDate: tradeForm.transactionDate,
        transactionType: tradeForm.transactionType,
      };
      setForm(nextForm);
      setDateInput(nextForm.transactionDate); // ISO for type="date"
      setUnitPriceInput("");
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
      // Immediately replace the temp entry with the real server-returned trade so it
      // survives even if the background load fails.
      try {
        const saved = (await res.clone().json()) as { trade?: TradeRecord };
        if (saved.trade) {
          setTrades((cur) =>
            editId
              ? cur.map((t) => (t.id === editId ? { ...saved.trade!, userId: t.userId } : t))
              : cur.map((t) => (t.id === tempId ? { ...saved.trade!, userId: t.userId } : t)),
          );
        }
      } catch {
        /* ignore — background load will sync */
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
        <span className={modalLabelClass}>Symbol <span className="text-danger">*</span></span>
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
        <span className={modalLabelClass}>Date <span className="text-danger">*</span></span>
        <input
          type="date"
          required
          className={modalFieldClass}
          value={form.transactionDate}
          onChange={(e) => {
            setDateInput(e.target.value);
            setForm({ ...form, transactionDate: e.target.value });
          }}
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
        <span className={modalLabelClass}>Quantity <span className="text-danger">*</span></span>
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
        <span className={modalLabelClass}>
          Unit price <span className="text-danger">*</span>{" "}
          <span className="font-normal text-subtle"></span>
        </span>
        <input
          type="text"
          required
          inputMode="decimal"
          className={`${modalFieldClass} font-mono`}
          value={unitPriceInput}
          onChange={(e) => {
            const raw = e.target.value;
            setUnitPriceInput(raw);
            setForm({ ...form, unitPrice: parseUnitPriceToVnd(raw) });
          }}
          onBlur={() => {
            if (form.unitPrice > 0) {
              // form.unitPrice is in K units; vndToKInput expects full VND
              setUnitPriceInput(vndToKInput(form.unitPrice * 1000));
            }
          }}
          placeholder="0"
        />
        {form.unitPrice > 0 && (
          <span className="mt-0.5 block text-[10px] text-subtle">
            = {Math.round(form.unitPrice * 1000).toLocaleString("vi-VN")} ₫
          </span>
        )}
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
          <span className={modalLabelClass}>Profit <span className="text-danger">*</span></span>
          <input
            type="number"
            required
            className={modalFieldClass}
            value={form.profit || ""}
            onChange={(e) => setForm({ ...form, profit: Number(e.target.value) })}
            placeholder="Enter realized profit/loss"
          />
          {form.profit !== 0 && (
            <span className="mt-0.5 block text-[10px] text-subtle">
              = {form.profit.toLocaleString("vi-VN")} ₫
            </span>
          )}
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Trades" value={String(summary.total)} accent="neutral" />
          <StatCard label="Buys" value={String(summary.buys)} accent="accent" />
          <StatCard label="Sells" value={String(summary.sells)} accent="violet" />
          <StatCard
            label="Net P/L"
            value={formatPortfolioAmount(summary.totalProfit, 0)}
            accent={summary.totalProfit >= 0 ? "accent" : "amber"}
            valueClass={summary.totalProfit > 0 ? "text-success" : summary.totalProfit < 0 ? "text-danger" : undefined}
          />
          <StatCard
            label="Win rate"
            value={summary.winRate != null ? formatPortfolioPercent(summary.winRate, 0) : "—"}
            accent="accent"
            valueClass={summary.winRate != null && summary.winRate > 0 ? "text-success" : undefined}
          />
          <StatCard
            label="Range"
            value={
              summary.firstDate
                ? `${formatDateDMY(summary.firstDate)} → ${formatDateDMY(todayISO())}`
                : "—"
            }
            accent="neutral"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openForm(emptyForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white shadow-md ring-2 ring-[var(--accent)]/30 transition hover:opacity-90 hover:shadow-lg"
        >
          <Plus className="h-4 w-4" /> Add trade
        </button>

        {/* Type filter — BUY / ALL / SELL toggle chips */}
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5">
          {(["", "BUY", "SELL"] as const).map((t) => {
            const label = t === "" ? "All" : t;
            const active = filters.type === t;
            const color =
              t === "BUY"
                ? "text-emerald-600 dark:text-emerald-400"
                : t === "SELL"
                  ? "text-red-500 dark:text-red-400"
                  : "";
            return (
              <button
                key={label}
                type="button"
                onClick={() => setFilters({ ...filters, type: t })}
                className={[
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  active
                    ? `bg-[var(--card)] shadow-sm ${color || "text-[var(--fg)]"}`
                    : "text-subtle hover:text-[var(--fg)]",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        <input
          placeholder="Symbol"
          className="w-24 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs uppercase"
          value={filters.symbol}
          onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}
        />
        <div className="flex items-center gap-1">
          <input
            type="date"
            title="From date"
            className="w-32 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value, year: "", month: "" })}
          />
          <span className="text-xs text-subtle">→</span>
          <input
            type="date"
            title="To date"
            className="w-32 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value, year: "", month: "" })}
          />
          {(filters.dateFrom || filters.dateTo) && (
            <button
              type="button"
              title="Clear date range"
              onClick={() => setFilters({ ...filters, dateFrom: "", dateTo: "" })}
              className="rounded px-1.5 py-0.5 text-xs text-subtle hover:text-[var(--fg)] hover:bg-[var(--bg-secondary)]"
            >
              ✕
            </button>
          )}
        </div>
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
              label="Add another"
            />
          ) : undefined
        }
        footer={
          <>
            <button
              type="submit"
              form="trade-form"
              className="flex-1 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white shadow-md ring-2 ring-[var(--accent)]/30 transition hover:opacity-90 hover:shadow-lg sm:flex-none sm:min-w-[140px]"
            >
              {editId ? "Save changes" : "Save trade"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="flex-1 rounded-lg bg-[var(--card)] px-5 py-3 text-sm font-semibold text-[var(--fg)] shadow-sm ring-2 ring-[var(--border)] transition hover:bg-[var(--bg-secondary)] sm:flex-none sm:min-w-[100px]"
            >
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

      <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] font-semibold uppercase tracking-wider text-subtle">
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
                    <td className="px-2 py-1.5 text-xs text-muted">{formatDateDMY(t.transactionDate)}</td>
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
                          openForm({
                            transactionDate: t.transactionDate,
                            itemName: t.itemName,
                            quantity: t.quantity,
                            unitPrice: t.unitPrice,
                            transactionType: t.transactionType,
                            fee: t.fee,
                            profit: t.profit ?? 0,
                            exchange: t.exchange ?? "",
                            sector: t.sector ?? "",
                          }, t.id);
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

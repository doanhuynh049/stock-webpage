"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, X } from "lucide-react";
import { addToWatchlist } from "@/lib/actions";
import { StockAvatar } from "@/components/ui/stock-avatar";

export type WatchlistSuggestion = {
  symbol: string;
  name: string;
  sector: string;
};

export function WatchlistAddPanel({
  suggestions,
  onAdded,
  onFailed,
}: {
  suggestions: WatchlistSuggestion[];
  onAdded?: (symbol: string) => void;
  onFailed?: (symbol: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toUpperCase();

  // Filter suggestions by ticker prefix or name substring
  const filtered = open
    ? suggestions
        .filter(
          (s) =>
            !q ||
            s.symbol.startsWith(q) ||
            s.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function submit(sym: string) {
    const ticker = sym.trim().toUpperCase();
    if (!ticker) return;
    setError(null);
    setQuery("");
    setOpen(false);
    onAdded?.(ticker);
    startTransition(async () => {
      try {
        const result = await addToWatchlist(ticker);
        if ("error" in result) {
          onFailed?.(ticker);
          setError(result.error);
        } else {
          setAdded(ticker);
          setTimeout(() => setAdded(null), 3000);
          // Bust the Next.js client-side router cache so navigating away and
          // back shows the updated watchlist instead of a stale snapshot.
          router.refresh();
        }
      } catch {
        onFailed?.(ticker);
        setError("Failed to add. Please try again.");
      }
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(query);
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={onSubmit}>
        <div className="relative">
          {/* Input */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-subtle" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setError(null);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder="Search ticker or company name…"
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] py-2.5 pl-9 pr-24 text-sm outline-none ring-0 transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
                className="absolute right-[4.5rem] text-subtle hover:text-[var(--fg)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="submit"
              disabled={pending || !query.trim()}
              className="absolute right-2 flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          {/* Dropdown */}
          {open && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
              {filtered.map((s) => (
                <button
                  key={s.symbol}
                  type="button"
                  onMouseDown={() => submit(s.symbol)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-[var(--bg-secondary)]"
                >
                  <StockAvatar symbol={s.symbol} sector={s.sector} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.symbol}</p>
                    <p className="truncate text-[11px] text-subtle">{s.name}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-medium text-accent">
                    {s.sector}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>

      {/* Feedback */}
      {added && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-bg)] px-3 py-2 text-sm text-accent">
          <Check className="h-4 w-4 shrink-0" />
          <span><strong>{added}</strong> added to watchlist</span>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Quick-add chips — show when input is empty */}
      {!query && suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">
            VN30 — quick add
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 12).map((s) => (
              <button
                key={s.symbol}
                type="button"
                disabled={pending}
                onClick={() => submit(s.symbol)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium transition hover:border-[var(--accent)]/40 hover:bg-[var(--accent-bg)] hover:text-accent disabled:opacity-50"
              >
                <StockAvatar symbol={s.symbol} sector={s.sector} size="sm" />
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

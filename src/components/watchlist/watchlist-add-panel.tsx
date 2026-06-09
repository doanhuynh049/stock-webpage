"use client";

import { FormEvent, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { addToWatchlist } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function WatchlistAddPanel({
  suggestions,
  onAdded,
  onFailed,
}: {
  suggestions: string[];
  onAdded?: (symbol: string) => void;
  onFailed?: (symbol: string) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(sym: string) {
    const ticker = sym.trim().toUpperCase();
    if (!ticker) return;
    setError(null);
    onAdded?.(ticker);
    startTransition(async () => {
      try {
        await addToWatchlist(ticker);
        setSymbol("");
      } catch (e) {
        onFailed?.(ticker);
        setError((e as Error).message || "Could not add symbol");
      }
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(symbol);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ticker e.g. FPT, VCB"
            className="pl-9"
            disabled={pending}
            list="watchlist-suggestions"
          />
          <datalist id="watchlist-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <Button type="submit" disabled={pending || !symbol.trim()}>
          <Plus className="h-4 w-4" />
          Add to watchlist
        </Button>
      </form>

      {error && <p className="text-xs text-danger">{error}</p>}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => submit(s)}
              className="rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-[11px] text-muted ring-1 ring-[var(--border)] hover:text-accent hover:ring-[var(--accent)]/30"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

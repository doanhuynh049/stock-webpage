"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function WatchlistButton({
  symbol,
  initialInWatchlist,
  isAuthenticated,
}: {
  symbol: string;
  initialInWatchlist: boolean;
  isAuthenticated: boolean;
}) {
  const [inWatchlist, setInWatchlist] = useState(initialInWatchlist);

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => (window.location.href = "/login")}
      >
        <Star className="h-4 w-4" />
        Watchlist
      </Button>
    );
  }

  async function toggle() {
    const wasInWatchlist = inWatchlist;
    setInWatchlist(!wasInWatchlist);
    const result = wasInWatchlist
      ? await removeFromWatchlist(symbol)
      : await addToWatchlist(symbol);
    if ("error" in result) {
      setInWatchlist(wasInWatchlist);
    }
  }

  return (
    <Button
      variant={inWatchlist ? "primary" : "secondary"}
      size="sm"
      onClick={toggle}
    >
      <Star className={`h-4 w-4 ${inWatchlist ? "fill-current" : ""}`} />
      {inWatchlist ? "Watching" : "Add to Watchlist"}
    </Button>
  );
}

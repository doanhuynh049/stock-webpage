"use client";

import { removeFromWatchlist } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function RemoveWatchlistButton({ symbol }: { symbol: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => removeFromWatchlist(symbol)}
    >
      Remove
    </Button>
  );
}

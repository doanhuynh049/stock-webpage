"use client";

import { removeFromWatchlist } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function RemoveWatchlistButton({
  symbol,
  onRemoved,
  onRestore,
}: {
  symbol: string;
  onRemoved?: () => void;
  onRestore?: () => void;
}) {
  function handleClick() {
    onRemoved?.();
    void removeFromWatchlist(symbol).catch(() => onRestore?.());
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleClick}>
      Remove
    </Button>
  );
}

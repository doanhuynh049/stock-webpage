"use client";

import { useCallback, useState } from "react";
import type { SortDir } from "@/lib/table-sort";

export function useTableSort<K extends string>(
  defaultKey: K | null = null,
  defaultDir: SortDir = "desc",
) {
  const [sortKey, setSortKey] = useState<K | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = useCallback((column: K) => {
    setSortKey((prev) => {
      if (prev === column) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return column;
      }
      setSortDir("desc");
      return column;
    });
  }, []);

  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir };
}

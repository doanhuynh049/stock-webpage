"use client";

import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table-sort";

/**
 * Same sort-button UX as `SortableTableHeader`, but rendered as a plain
 * `<button>` instead of a `<th>` — for the AI modules' card/row lists
 * (flex rows, not `<table>` markup), which can't use a `<th>`-based header.
 */
export function SortableColumn<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sortKey: K | null;
  sortDir: SortDir;
  onSort: (column: K) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        "inline-flex items-center gap-0.5 hover:text-[var(--fg)]",
        active && "text-accent",
        className,
      )}
    >
      <span>{label}</span>
      {active && (
        <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

"use client";

import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table-sort";

export function SortableTableHeader<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  column: K;
  sortKey: K | null;
  sortDir: SortDir;
  onSort: (column: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const active = sortKey === column;

  return (
    <th className={cn(alignClass, className)}>
      <button
        type="button"
        className={cn(
          "inline-flex max-w-full items-center gap-0.5 hover:text-[var(--fg)]",
          align === "right" && "ml-auto",
          align === "center" && "mx-auto",
        )}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        {active && (
          <span className="text-accent" aria-hidden>
            {sortDir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </button>
    </th>
  );
}

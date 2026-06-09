export type SortDir = "asc" | "desc";

export function compareStrings(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

export function compareNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
  nullLast = true,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return nullLast ? 1 : -1;
  if (b == null) return nullLast ? -1 : 1;
  return a - b;
}

export function applySortDir(cmp: number, dir: SortDir): number {
  return dir === "asc" ? cmp : -cmp;
}

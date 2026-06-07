export function dedupeBySymbol<T extends { symbol: string }>(
  rows: T[],
  pick?: (existing: T, incoming: T) => T,
): T[] {
  const bySymbol = new Map<string, T>();
  for (const row of rows) {
    const sym = row.symbol?.toUpperCase();
    if (!sym) continue;
    const prev = bySymbol.get(sym);
    bySymbol.set(sym, prev && pick ? pick(prev, row) : row);
  }
  return Array.from(bySymbol.values());
}

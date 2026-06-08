import { readFileSync } from "node:fs";
import { join } from "node:path";

export type SectorDefinition = {
  id: string;
  name: string;
  tickers: string[];
};

type SectorStocksFile = {
  sectors: SectorDefinition[];
};

let cached: SectorDefinition[] | null = null;

export function getSectorUniverse(): SectorDefinition[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data", "sector-stocks.json"), "utf-8"),
  ) as SectorStocksFile;
  cached = raw.sectors ?? [];
  return cached;
}

/** Map ticker → sector id for portfolio allocation rollup. */
export function tickerToSectorId(): Map<string, string> {
  const map = new Map<string, string>();
  for (const sec of getSectorUniverse()) {
    for (const t of sec.tickers) {
      map.set(t.toUpperCase(), sec.id);
    }
  }
  return map;
}

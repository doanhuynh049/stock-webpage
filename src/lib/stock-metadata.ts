import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexStock } from "@/lib/analysis/index-universe";

type Meta = IndexStock & { exchange?: string };

let metaCache: Map<string, Meta> | null = null;

function loadMetaMap(): Map<string, Meta> {
  if (metaCache) return metaCache;
  metaCache = new Map();
  for (const file of ["vn30-stock-info.json", "vn100-stock-info.json"]) {
    try {
      const raw = JSON.parse(
        readFileSync(join(process.cwd(), "data", file), "utf-8"),
      ) as Record<string, IndexStock[]>;
      const key = file.startsWith("vn30") ? "vn30_stocks" : "vn100_stocks";
      for (const s of raw[key] ?? []) {
        metaCache.set(s.symbol.toUpperCase(), {
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          exchange: "HOSE",
        });
      }
    } catch {
      /* optional files */
    }
  }
  return metaCache;
}

export function lookupIndexStock(symbol: string): Meta | undefined {
  return loadMetaMap().get(symbol.toUpperCase());
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { IndexStock } from "@/lib/analysis/index-universe";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";

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

/** Sync JSON-backed lookup (VN30/VN100 members only). */
export function lookupIndexStock(symbol: string): Meta | undefined {
  return loadMetaMap().get(symbol.toUpperCase());
}

/**
 * Clears the in-memory JSON cache so the next call to lookupIndexStock()
 * re-reads the JSON files. Called after the update-index admin route runs.
 */
export function clearMetaCache(): void {
  metaCache = null;
}

/**
 * Async DB-backed lookup for stocks that have been AI-classified or manually
 * entered into the stock_symbol table but are not in the VN30/VN100 JSON files.
 */
export async function lookupIndexStockFromDB(symbol: string): Promise<Meta | undefined> {
  if (!isPersistenceEnabled()) return undefined;
  try {
    const row = await prisma.stockSymbol.findUnique({
      where: { symbol: symbol.toUpperCase() },
      select: { symbol: true, name: true, sector: true, exchange: true },
    });
    if (row?.name && row.name !== symbol && row.sector && row.sector !== "Unknown") {
      return {
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        exchange: row.exchange ?? "HOSE",
      };
    }
  } catch {
    /* DB unavailable */
  }
  return undefined;
}

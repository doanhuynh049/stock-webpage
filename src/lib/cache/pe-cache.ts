import fs from "fs/promises";
import path from "path";
import { canWriteLocalCache } from "@/lib/serverless";

const CACHE_FILE = path.join(process.cwd(), ".cache", "pe-ratios.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

type PeCachePayload = {
  syncedAt: string;
  ratios: Record<string, number>;
};

let memory: PeCachePayload | null = null;

async function readPayload(): Promise<PeCachePayload | null> {
  if (memory) return memory;
  if (!canWriteLocalCache()) return null;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    memory = JSON.parse(raw) as PeCachePayload;
    return memory;
  } catch {
    return null;
  }
}

async function persistPayload(payload: PeCachePayload): Promise<void> {
  memory = payload;
  if (!canWriteLocalCache()) return;
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn("[pe-cache] disk write skipped:", (err as Error).message);
  }
}

export async function getCachedPe(symbol: string): Promise<number | null> {
  const payload = await readPayload();
  if (!payload) return null;
  if (Date.now() - new Date(payload.syncedAt).getTime() > CACHE_TTL_MS) {
    return null;
  }
  const pe = payload.ratios[symbol.toUpperCase()];
  return pe != null && pe > 0 ? pe : null;
}

export async function getCachedPeBatch(
  symbols: string[],
): Promise<Map<string, number>> {
  const payload = await readPayload();
  const out = new Map<string, number>();
  if (!payload) return out;
  if (Date.now() - new Date(payload.syncedAt).getTime() > CACHE_TTL_MS) {
    return out;
  }
  for (const sym of symbols) {
    const pe = payload.ratios[sym.toUpperCase()];
    if (pe != null && pe > 0) out.set(sym.toUpperCase(), pe);
  }
  return out;
}

export async function savePeToCache(
  symbol: string,
  pe: number,
): Promise<void> {
  if (!Number.isFinite(pe) || pe <= 0) return;
  const sym = symbol.toUpperCase();
  const existing = (await readPayload()) ?? {
    syncedAt: new Date().toISOString(),
    ratios: {},
  };
  existing.ratios[sym] = pe;
  existing.syncedAt = new Date().toISOString();
  await persistPayload(existing);
}

export async function savePeBatchToCache(
  ratios: Record<string, number>,
): Promise<void> {
  const existing = (await readPayload()) ?? {
    syncedAt: new Date().toISOString(),
    ratios: {},
  };
  for (const [sym, pe] of Object.entries(ratios)) {
    if (pe > 0) existing.ratios[sym.toUpperCase()] = pe;
  }
  existing.syncedAt = new Date().toISOString();
  await persistPayload(existing);
}

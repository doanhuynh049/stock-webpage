import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getLlmStatus } from "@/lib/providers/llm";

export async function GET() {
  let cacheAge: string | null = null;
  let cacheSource: string | null = null;

  try {
    const raw = await readFile(
      path.join(process.cwd(), ".cache/market-data.json"),
      "utf-8",
    );
    const cache = JSON.parse(raw);
    cacheAge = cache.syncedAt;
    cacheSource = cache.source;
  } catch {
    // no cache yet
  }

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    data: {
      providers: {
        entrade: "https://services.entrade.com.vn/chart-api/v2 (free, no key)",
        yahoo: "https://query1.finance.yahoo.com (free, no key)",
      },
      cache: { syncedAt: cacheAge, source: cacheSource },
    },
    llm: getLlmStatus(),
    apis: [
      "GET  /api/health",
      "GET  /api/market?refresh=true",
      "GET  /api/stocks",
      "GET  /api/stocks/:symbol",
      "GET  /api/stocks/:symbol/history?days=90",
      "GET  /api/news?symbol=FPT",
      "POST /api/ai",
      "POST /api/data/sync",
    ],
  });
}

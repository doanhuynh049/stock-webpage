/**
 * POST /api/admin/update-index
 *
 * Fetches the current VN30 and VN100 constituent lists from the TCBS public API,
 * then upserts each member into the stock_symbol DB table (name, sector, isVn30,
 * isVn100) and clears the in-memory metadata cache so the next request picks up
 * the latest data.
 *
 * Auth: Bearer $CRON_SECRET header (cron) or logged-in admin session.
 * Cron schedule: every Monday 08:00 UTC (see vercel.json).
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearMetaCache } from "@/lib/stock-metadata";

// ---------------------------------------------------------------------------
// TCBS public API — returns index composition
// Fallback: SSI iBoard API
// ---------------------------------------------------------------------------

interface TcbsComponent {
  ticker: string;   // e.g. "FPT"
  fullname?: string;
  organName?: string;
  icbName?: string;  // sector
}

async function fetchTcbsIndex(indexCode: string): Promise<string[]> {
  const url = `https://apipubaws.tcbs.com.vn/stock-insight/v1/index/${indexCode}/components`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`TCBS ${indexCode}: HTTP ${res.status}`);
  const data = (await res.json()) as { data?: TcbsComponent[] };
  return (data.data ?? []).map((c) => c.ticker.toUpperCase()).filter(Boolean);
}

// SSI iBoard fallback
async function fetchSsiIndex(code: string): Promise<string[]> {
  const url = `https://iboard-query.ssi.com.vn/v2/stock/watchlist?watchlistCode=${code}&limit=120`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SSI ${code}: HTTP ${res.status}`);
  const data = (await res.json()) as { data?: { stockCode?: string }[] };
  return (data.data ?? [])
    .map((c) => (c.stockCode ?? "").toUpperCase())
    .filter(Boolean);
}

async function fetchIndex(code: string): Promise<{ symbols: string[]; source: string }> {
  try {
    const symbols = await fetchTcbsIndex(code);
    if (symbols.length >= 10) return { symbols, source: "tcbs" };
  } catch (e) {
    console.warn(`[update-index] TCBS ${code} failed:`, (e as Error).message);
  }
  try {
    const symbols = await fetchSsiIndex(code);
    if (symbols.length >= 10) return { symbols, source: "ssi" };
  } catch (e) {
    console.warn(`[update-index] SSI ${code} failed:`, (e as Error).message);
  }
  return { symbols: [], source: "none" };
}

// ---------------------------------------------------------------------------
// DB update
// ---------------------------------------------------------------------------

async function upsertIndexMembers(
  vn30Symbols: Set<string>,
  vn100Symbols: Set<string>,
): Promise<{ inserted: number; updated: number }> {
  const allSymbols = new Set([...vn30Symbols, ...vn100Symbols]);
  let inserted = 0;
  let updated = 0;

  for (const symbol of allSymbols) {
    const existing = await prisma.stockSymbol.findUnique({ where: { symbol } });
    if (existing) {
      await prisma.stockSymbol.update({
        where: { symbol },
        data: {
          isVn30: vn30Symbols.has(symbol),
          isVn100: vn100Symbols.has(symbol),
          updatedAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.stockSymbol.create({
        data: {
          symbol,
          name: symbol,
          isVn30: vn30Symbols.has(symbol),
          isVn100: vn100Symbols.has(symbol),
        },
      });
      inserted++;
    }
  }

  // Clear isVn30/isVn100 for symbols that are no longer in the index
  await prisma.stockSymbol.updateMany({
    where: { isVn30: true, symbol: { notIn: [...vn30Symbols] } },
    data: { isVn30: false, updatedAt: new Date() },
  });
  await prisma.stockSymbol.updateMany({
    where: { isVn100: true, symbol: { notIn: [...vn100Symbols] } },
    data: { isVn100: false, updatedAt: new Date() },
  });

  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = new Date().toISOString();

  const [vn30Result, vn100Result] = await Promise.all([
    fetchIndex("VN30"),
    fetchIndex("VN100"),
  ]);

  if (vn30Result.symbols.length === 0 && vn100Result.symbols.length === 0) {
    return NextResponse.json(
      { error: "All index sources failed — no data fetched", startedAt },
      { status: 502 },
    );
  }

  const vn30Set = new Set(vn30Result.symbols);
  const vn100Set = new Set(vn100Result.symbols);

  const { inserted, updated } = await upsertIndexMembers(vn30Set, vn100Set);

  // Invalidate in-memory cache so next lookup reads fresh DB data
  clearMetaCache();

  return NextResponse.json({
    startedAt,
    finishedAt: new Date().toISOString(),
    vn30: { count: vn30Set.size, source: vn30Result.source, sample: [...vn30Set].slice(0, 5) },
    vn100: { count: vn100Set.size, source: vn100Result.source, sample: [...vn100Set].slice(0, 5) },
    db: { inserted, updated },
  });
}

// GET — monitoring status (authenticated users only)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [vn30Count, vn100Count, totalKnown, lastUpdated] = await Promise.all([
      prisma.stockSymbol.count({ where: { isVn30: true } }),
      prisma.stockSymbol.count({ where: { isVn100: true } }),
      prisma.stockSymbol.count({ where: { sector: { not: null } } }),
      prisma.stockSymbol.findFirst({
        where: { OR: [{ isVn30: true }, { isVn100: true }] },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    // VN30 members with name/sector populated
    const vn30Members = await prisma.stockSymbol.findMany({
      where: { isVn30: true },
      select: { symbol: true, name: true, sector: true, updatedAt: true },
      orderBy: { symbol: "asc" },
    });

    const vn100OnlyMembers = await prisma.stockSymbol.findMany({
      where: { isVn100: true, isVn30: false },
      select: { symbol: true },
      orderBy: { symbol: "asc" },
    });

    return NextResponse.json({
      status: "ok",
      lastIndexSync: lastUpdated?.updatedAt ?? null,
      vn30: {
        count: vn30Count,
        members: vn30Members,
      },
      vn100: {
        count: vn100Count,
        vn100OnlySymbols: vn100OnlyMembers.map((s) => s.symbol),
      },
      db: {
        totalSymbolsWithSector: totalKnown,
      },
      nextScheduledSync: "Every Monday 08:00 UTC (vercel.json cron)",
      triggerManually: "POST /api/admin/update-index with Authorization: Bearer $CRON_SECRET",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "DB query failed", detail: (e as Error).message },
      { status: 500 },
    );
  }
}

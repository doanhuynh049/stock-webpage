import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQuotesForSymbols } from "@/lib/market-service";
import {
  addTrade,
  listTrades,
  summarizeTrades,
} from "@/lib/db/trading-store";
import type { TradeInput } from "@/lib/db/trading-types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const userId = session.user.id;
    const trades = await listTrades(
      userId,
      {
        year: searchParams.get("year") ?? undefined,
        month: searchParams.get("month") ?? undefined,
        type: searchParams.get("type") ?? undefined,
        symbol: searchParams.get("symbol") ?? undefined,
      },
      { email: session.user.email },
    );

    const symbols = [...new Set(trades.map((t) => t.itemName))];
    const quotes = await getQuotesForSymbols(symbols);
    const currentPrices: Record<string, number> = {};
    for (const [sym, price] of Object.entries(quotes)) {
      if (price > 0) currentPrices[sym] = price / 1000;
    }

    return NextResponse.json({
      success: true,
      trades,
      summary: summarizeTrades(trades),
      currentPrices,
      totalForUser: trades.length,
    });
  } catch (error) {
    console.error("[api/trading] GET failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
        trades: [],
        summary: summarizeTrades([]),
        currentPrices: {},
        totalForUser: 0,
      },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TradeInput;
  try {
    body = (await request.json()) as TradeInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.itemName?.trim() || body.quantity <= 0 || body.unitPrice <= 0) {
    return NextResponse.json({ error: "Invalid trade fields" }, { status: 400 });
  }

  try {
    const trade = await addTrade(session.user.id, body);
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`);
    return NextResponse.json({ success: true, trade, portfolioSynced: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

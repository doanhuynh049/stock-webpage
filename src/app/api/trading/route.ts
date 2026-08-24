import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getQuotesForSymbols } from "@/lib/market-service";
import {
  addTrade,
  listTrades,
  summarizeTrades,
} from "@/lib/db/trading-store";
import { log } from "@/lib/logger";
import { tradeInputSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";
import { apiError } from "@/lib/api-error";

// Never cache — trades are per-user and change on every mutation.
export const dynamic = "force-dynamic";

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
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
      },
      { email: session.user.email },
    );

    const symbols = [...new Set(trades.map((t) => t.itemName))];
    const quotes = await getQuotesForSymbols(symbols);
    const currentPrices: Record<string, number> = {};
    for (const [sym, price] of Object.entries(quotes)) {
      // unitPrice is stored in K (thousands) — divide full-VND quote by 1000 to match
      if (price > 0) currentPrices[sym] = price / 1000;
    }

    return NextResponse.json(
      {
        success: true,
        trades,
        summary: summarizeTrades(trades),
        currentPrices,
        totalForUser: trades.length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Returns HTTP 200 even on failure (deliberate — see trading-ledger.tsx),
    // so the client always gets a well-formed body instead of an uncaught
    // exception; only the message shown to the user is sanitized.
    return apiError("trading-api", "GET failed", error, {
      status: 200,
      publicMessage: "Failed to load trades. Please try again.",
      body: {
        trades: [],
        summary: summarizeTrades([]),
        currentPrices: {},
        totalForUser: 0,
      },
    });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, tradeInputSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  log.info("trading-api", "POST addTrade request received", {
    userId: session.user.id,
    symbol: body.itemName,
    type: body.transactionType,
    qty: body.quantity,
    unit: body.unitPrice,
    date: body.transactionDate,
  });

  try {
    const trade = await addTrade(session.user.id, body);
    log.info("trading-api", "POST addTrade success", {
      tradeId: trade.id,
      symbol: body.itemName,
      type: body.transactionType,
      qty: body.quantity,
    });
    revalidatePath("/trading");
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, trade, portfolioSynced: true });
  } catch (error) {
    return apiError("trading-api", "POST failed", error, {
      publicMessage: "Failed to save trade. Please try again.",
      meta: { symbol: body.itemName },
    });
  }
}

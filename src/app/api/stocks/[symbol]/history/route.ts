import { NextResponse } from "next/server";
import { getPriceHistory, getStock } from "@/lib/market-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const stock = await getStock(symbol);

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "90", 10);
  const history = await getPriceHistory(symbol, days);

  return NextResponse.json({
    symbol: stock.symbol,
    source: history.length > 0 ? "entrade|yahoo" : "none",
    count: history.length,
    history,
  });
}

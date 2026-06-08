import { NextResponse } from "next/server";
import {
  generateAiSummary,
  getStock,
  getTechnicalSignals,
} from "@/lib/market-service";
import { getNewsLive } from "@/lib/news-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const stock = await getStock(symbol);

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const [technicals, news] = await Promise.all([
    getTechnicalSignals(stock),
    getNewsLive(symbol),
  ]);
  const aiSummary = generateAiSummary(stock);

  return NextResponse.json({ stock, technicals, news, aiSummary });
}

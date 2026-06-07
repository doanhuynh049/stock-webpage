import { NextResponse } from "next/server";
import {
  generateAiSummary,
  getNews,
  getStock,
  getTechnicalSignals,
} from "@/lib/market-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const stock = await getStock(symbol);

  if (!stock) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const technicals = await getTechnicalSignals(stock);
  const news = getNews(symbol);
  const aiSummary = generateAiSummary(stock);

  return NextResponse.json({ stock, technicals, news, aiSummary });
}

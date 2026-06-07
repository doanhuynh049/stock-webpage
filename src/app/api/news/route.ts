import { NextResponse } from "next/server";
import { getNews } from "@/lib/market-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? undefined;
  const news = getNews(symbol);

  return NextResponse.json({ count: news.length, news });
}

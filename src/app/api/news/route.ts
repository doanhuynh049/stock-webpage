import { NextResponse } from "next/server";
import { getNewsLive, syncNews } from "@/lib/news-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? undefined;
  const refresh = searchParams.get("refresh") === "true";

  if (refresh) {
    const sync = await syncNews(symbol ?? undefined);
    const news = await getNewsLive(symbol);
    return NextResponse.json({ count: news.length, news, sync });
  }

  const news = await getNewsLive(symbol);
  return NextResponse.json({ count: news.length, news });
}

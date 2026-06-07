import { NextResponse } from "next/server";
import { getMarketSnapshot, syncMarketData } from "@/lib/market-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  if (refresh) {
    const sync = await syncMarketData(true);
    const market = await getMarketSnapshot();
    return NextResponse.json({ market, sync });
  }

  const market = await getMarketSnapshot();
  return NextResponse.json({ market });
}

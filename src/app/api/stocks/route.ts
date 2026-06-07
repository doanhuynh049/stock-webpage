import { NextResponse } from "next/server";
import { getAllStocks, getSectors, screenStocks } from "@/lib/market-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const filters = {
    maxPe: searchParams.get("maxPe")
      ? parseFloat(searchParams.get("maxPe")!)
      : undefined,
    minRevenueGrowth: searchParams.get("minRevenueGrowth")
      ? parseFloat(searchParams.get("minRevenueGrowth")!)
      : undefined,
    minRoe: searchParams.get("minRoe")
      ? parseFloat(searchParams.get("minRoe")!)
      : undefined,
    maxRsi: searchParams.get("maxRsi")
      ? parseFloat(searchParams.get("maxRsi")!)
      : undefined,
    sector: searchParams.get("sector") ?? undefined,
  };

  const hasFilters = Object.values(filters).some((v) => v !== undefined);
  const stocks = hasFilters
    ? await screenStocks(filters)
    : await getAllStocks();

  return NextResponse.json({
    count: stocks.length,
    sectors: await getSectors(),
    stocks,
  });
}

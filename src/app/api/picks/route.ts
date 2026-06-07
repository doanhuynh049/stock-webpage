import { NextResponse } from "next/server";
import { getStockPicks } from "@/lib/stock-picks";

export async function GET() {
  const data = await getStockPicks(8);
  return NextResponse.json(data);
}

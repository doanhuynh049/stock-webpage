import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import {
  listPortfolioHoldings,
  syncPortfolioHoldings,
  type PortfolioHoldingInput,
} from "@/lib/db/portfolio-sync";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listPortfolioHoldings(session.user.id);
    return NextResponse.json({
      success: true,
      holdings: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        sector: r.sector,
        industry: r.industry,
        shares: r.shares,
        avgBuyPrice: r.avgBuyPrice,
        target3Month: r.target3Month,
        targetLongTerm: r.targetLongTerm,
        targetSetDate: r.targetSetDate,
        platform: r.platform,
      })),
      totalHoldings: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PortfolioHoldingInput[];
  try {
    body = (await request.json()) as PortfolioHoldingInput[];
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const totalHoldings = await syncPortfolioHoldings(session.user.id, body);
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, totalHoldings });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

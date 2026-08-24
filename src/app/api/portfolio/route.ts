import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import {
  listPortfolioHoldings,
  syncPortfolioHoldings,
} from "@/lib/db/portfolio-sync";
import { portfolioHoldingsBodySchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";
import { apiError } from "@/lib/api-error";

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
    return apiError("portfolio-api", "GET failed", error, { meta: { userId: session.user.id } });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, portfolioHoldingsBodySchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  try {
    const totalHoldings = await syncPortfolioHoldings(session.user.id, body);
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, totalHoldings });
  } catch (error) {
    return apiError("portfolio-api", "POST failed", error, { meta: { userId: session.user.id } });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildPricePrediction } from "@/lib/analysis/prediction-model";
import { apiError } from "@/lib/api-error";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    symbol?: string;
    horizonDays?: number;
  };
  const symbol = body.symbol?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    const prediction = await buildPricePrediction(symbol, { horizonDays: body.horizonDays });
    return NextResponse.json(prediction);
  } catch (error) {
    return apiError("prediction-api", "POST failed", error, { meta: { symbol } });
  }
}

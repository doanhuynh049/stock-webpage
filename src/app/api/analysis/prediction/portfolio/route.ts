import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildPortfolioPredictionOverview } from "@/lib/analysis/prediction-portfolio";
import { DEFAULT_HORIZON_DAYS } from "@/lib/analysis/prediction-config";
import { apiError } from "@/lib/api-error";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const horizonDays = parseInt(searchParams.get("horizonDays") ?? "", 10) || DEFAULT_HORIZON_DAYS;

  try {
    const overview = await buildPortfolioPredictionOverview(session.user.id, horizonDays);
    return NextResponse.json(overview);
  } catch (error) {
    return apiError("prediction-portfolio-api", "GET failed", error);
  }
}

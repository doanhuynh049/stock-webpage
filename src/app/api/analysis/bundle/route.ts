import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeUniverseBundle } from "@/lib/analysis/combined-analysis";
import { analyzeEtfUniverse } from "@/lib/analysis/etf-analysis";
import { getVN100Universe, getVN30Universe } from "@/lib/analysis/index-universe";
import { CACHE_TTL, pageCache } from "@/lib/page-cache";
import { apiError } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const universe = req.nextUrl.searchParams.get("universe");

  try {
    if (universe === "vn30") {
      const bundle = await pageCache(
        ["analysis-bundle-vn30"],
        () => analyzeUniverseBundle(getVN30Universe()),
        { revalidate: CACHE_TTL.analysis, tags: ["analysis-vn30"] },
      );
      return NextResponse.json({ universe: "vn30", bundle });
    }

    if (universe === "vn100") {
      const bundle = await pageCache(
        ["analysis-bundle-vn100"],
        () => analyzeUniverseBundle(getVN100Universe(), 30),
        { revalidate: CACHE_TTL.analysis, tags: ["analysis-vn100"] },
      );
      return NextResponse.json({ universe: "vn100", bundle });
    }

    if (universe === "etf") {
      const etfBundle = await pageCache(
        ["analysis-etf"],
        () => analyzeEtfUniverse(),
        { revalidate: CACHE_TTL.analysis, tags: ["analysis-etf"] },
      );
      return NextResponse.json({ universe: "etf", etfBundle });
    }

    return NextResponse.json(
      { error: "universe must be vn30, vn100, or etf" },
      { status: 400 },
    );
  } catch (error) {
    return apiError("analysis-bundle-api", "GET failed", error, { meta: { universe } });
  }
}

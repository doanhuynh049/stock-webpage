import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncMarketData } from "@/lib/market-service";
import { getLlmStatus } from "@/lib/providers/llm";

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await syncMarketData(true);

  return NextResponse.json({
    ...result,
    llm: getLlmStatus(),
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncMarketData(false);
  return NextResponse.json({
    ...result,
    llm: getLlmStatus(),
  });
}

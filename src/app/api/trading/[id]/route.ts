import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeTrade, updateTrade } from "@/lib/db/trading-store";
import type { TradeInput } from "@/lib/db/trading-types";
import { log } from "@/lib/logger";

// Never cache — per-user, changes on every mutation.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: TradeInput;
  try {
    body = (await request.json()) as TradeInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const trade = await updateTrade(session.user.id, id, body);
    log.info("trading-api", "trade updated", { id, symbol: body.itemName, type: body.transactionType });
    revalidatePath("/trading");
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, trade, portfolioSynced: true });
  } catch (error) {
    log.error("trading-api", "PUT failed", { id, error: (error as Error).message });
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await removeTrade(session.user.id, id);
    log.info("trading-api", "trade deleted", { id });
    revalidatePath("/trading");
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, portfolioSynced: true });
  } catch (error) {
    log.error("trading-api", "DELETE failed", { id, error: (error as Error).message });
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

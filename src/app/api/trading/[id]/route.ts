import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeTrade, updateTrade } from "@/lib/db/trading-store";
import { log } from "@/lib/logger";
import { tradeInputSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";
import { apiError } from "@/lib/api-error";

// Never cache — per-user, changes on every mutation.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = await parseJsonBody(request, tradeInputSchema);
  if (parsed.response) return parsed.response;
  const body = parsed.data;

  try {
    const trade = await updateTrade(session.user.id, id, body);
    log.info("trading-api", "trade updated", { id, symbol: body.itemName, type: body.transactionType });
    revalidatePath("/trading");
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    revalidateTag(`analysis-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, trade, portfolioSynced: true });
  } catch (error) {
    return apiError("trading-api", "PUT failed", error, {
      publicMessage: "Failed to update trade. Please try again.",
      meta: { id },
    });
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
    return apiError("trading-api", "DELETE failed", error, {
      publicMessage: "Failed to delete trade. Please try again.",
      meta: { id },
    });
  }
}

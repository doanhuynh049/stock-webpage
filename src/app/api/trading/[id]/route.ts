import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { removeTrade, updateTrade } from "@/lib/db/trading-store";
import type { TradeInput } from "@/lib/db/trading-types";

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
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, trade, portfolioSynced: true });
  } catch (error) {
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
    revalidatePath("/portfolio");
    revalidateTag(`portfolio-${session.user.id}`, { expire: 0 });
    return NextResponse.json({ success: true, portfolioSynced: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadDefaultStrategyConfig } from "@/lib/strategy/strategy-config";
import {
  getUserStrategyConfig,
  resetUserStrategyConfig,
  saveUserStrategyConfig,
} from "@/lib/strategy/user-strategy";
import { userStrategyOverridesSchema } from "@/lib/validation/schemas";
import { parseJsonBody } from "@/lib/validation/validate";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getUserStrategyConfig(session.user.id);
  const defaults = loadDefaultStrategyConfig();
  return NextResponse.json({ config, defaults });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, userStrategyOverridesSchema);
  if (parsed.response) return parsed.response;

  const config = await saveUserStrategyConfig(session.user.id, parsed.data);
  revalidatePath("/strategy-review");
  return NextResponse.json({ success: true, config });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await resetUserStrategyConfig(session.user.id);
  revalidatePath("/strategy-review");
  return NextResponse.json({ success: true, config });
}

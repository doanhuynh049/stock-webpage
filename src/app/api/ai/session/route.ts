import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clearAiChatSession, loadAiChatSession } from "@/lib/db/ai-chat-store";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chat = await loadAiChatSession(session.user.id);
  return NextResponse.json(chat);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await clearAiChatSession(session.user.id);
  const chat = await loadAiChatSession(session.user.id);
  return NextResponse.json({ success: true, ...chat });
}

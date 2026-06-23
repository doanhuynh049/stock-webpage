import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getConversationForAi,
  appendAiChatMessages,
  stripAssistantMeta,
} from "@/lib/db/ai-chat-store";
import { runAgent } from "@/lib/agent/agent-loop";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";
import type { LlmApiKeys, LlmProvider } from "@/lib/providers/llm";

async function loadUserApiKeys(userId: string): Promise<LlmApiKeys> {
  if (!isPersistenceEnabled()) return {};
  try {
    const row = await prisma.aiResponseCache.findFirst({
      where: { symbol: "_ai_cfg_", analysisType: "ai_config", modelName: userId },
    });
    if (!row?.payload) return {};
    const cfg = row.payload as {
      providers?: Array<{ id: string; apiKey?: string; enabled?: boolean }>;
    };
    const keys: LlmApiKeys = {};
    for (const p of cfg.providers ?? []) {
      if (p.apiKey && p.enabled !== false) {
        keys[p.id as LlmProvider] = p.apiKey;
      }
    }
    return keys;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { question?: string; sessionId?: string };
  const { question, sessionId } = body;

  if (!question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }

  const [conversation, apiKeys] = await Promise.all([
    getConversationForAi(session.user.id, sessionId ?? null),
    loadUserApiKeys(session.user.id),
  ]);

  const history = conversation.messages.slice(-6).map((m) => ({
    role: m.role as "user" | "assistant",
    content: stripAssistantMeta(m.content),
  }));

  const { answer, trace, provider, model, iterations } = await runAgent(
    question,
    history,
    { apiKeys },
  );

  const saved = await appendAiChatMessages(
    session.user.id,
    sessionId ?? conversation.sessionId,
    question,
    answer,
  );

  return NextResponse.json({
    answer,
    trace,
    sessionId: saved.sessionId,
    provider,
    model,
    iterations,
  });
}

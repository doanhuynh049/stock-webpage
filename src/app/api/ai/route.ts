import { NextResponse } from "next/server";
import { analyzeQuestion } from "@/lib/ai-analyst";
import { auth } from "@/lib/auth";
import {
  appendAiChatMessages,
  getConversationForAi,
  stripAssistantMeta,
} from "@/lib/db/ai-chat-store";
import { buildAiContext } from "@/lib/market-service";
import { callLlm, type LlmMessage } from "@/lib/providers/llm";

const MAX_HISTORY_TURNS = 12;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, sessionId } = await request.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  const conversation = await getConversationForAi(session.user.id, sessionId ?? null);
  const priorText = conversation.messages
    .map((m) => stripAssistantMeta(m.content))
    .join("\n");

  const context = await buildAiContext(question, priorText);

  const llmHistory: LlmMessage[] = conversation.messages
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({
      role: m.role,
      content: stripAssistantMeta(m.content),
    }));

  let answer = "";
  let provider = "fallback";
  let model = "rule-based";

  const llmResult = await callLlm(
    [...llmHistory, { role: "user", content: question }],
    context,
  );

  if (llmResult.content) {
    answer = llmResult.content;
    provider = llmResult.provider;
    model = llmResult.model;
  } else {
    answer = await analyzeQuestion(question, priorText);
    provider = "fallback";
    model = "rule-based";
  }

  const result = await appendAiChatMessages(
    session.user.id,
    sessionId ?? conversation.sessionId,
    question,
    answer,
  );
  return NextResponse.json({
    answer,
    sessionId: result.sessionId,
    provider,
    model,
  });
}

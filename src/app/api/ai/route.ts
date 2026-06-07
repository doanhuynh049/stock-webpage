import { NextResponse } from "next/server";
import { analyzeQuestion } from "@/lib/ai-analyst";
import { auth } from "@/lib/auth";
import { saveAiMessage } from "@/lib/actions";
import { buildAiContext } from "@/lib/market-service";
import { callLlm } from "@/lib/providers/llm";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { question, sessionId } = await request.json();
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  const context = await buildAiContext(question);
  let answer = "";
  let provider = "fallback";
  let model = "rule-based";

  const llmResult = await callLlm(
    [{ role: "user", content: question }],
    context,
  );

  if (llmResult.content) {
    answer = llmResult.content;
    provider = llmResult.provider;
    model = llmResult.model;
  } else {
    answer = await analyzeQuestion(question);
    provider = "fallback";
    model = "rule-based";
  }

  try {
    const result = await saveAiMessage(sessionId ?? null, question, answer);
    return NextResponse.json({
      answer,
      sessionId: result.sessionId,
      provider,
      model,
    });
  } catch {
    return NextResponse.json({
      answer,
      sessionId: sessionId ?? null,
      provider,
      model,
    });
  }
}

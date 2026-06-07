import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { canUseLocalDataFiles } from "@/lib/serverless";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export type ChatSession = {
  sessionId: string;
  messages: ChatMessage[];
};

const CHAT_DIR = join(process.cwd(), "data", "user-ai-chat");

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "## Xin chào!\n\nI'm your **Vietnam Stock AI Analyst**. Ask about any ticker, compare stocks, or get market insights.\n\nData refreshes at **morning** and **afternoon** sessions.",
};

function filePath(userId: string): string {
  return join(CHAT_DIR, `${userId}.json`);
}

function readFileSession(userId: string): ChatSession | null {
  if (!canUseLocalDataFiles()) return null;
  const path = filePath(userId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as ChatSession;
    if (!raw?.sessionId || !Array.isArray(raw.messages)) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeFileSession(userId: string, session: ChatSession) {
  if (!canUseLocalDataFiles()) return;
  mkdirSync(CHAT_DIR, { recursive: true });
  writeFileSync(filePath(userId), JSON.stringify(session, null, 2));
}

export async function loadAiChatSession(userId: string): Promise<ChatSession> {
  const cached = readFileSession(userId);
  if (cached?.messages.length) return cached;

  if (!isPersistenceEnabled()) {
    return { sessionId: randomUUID(), messages: [WELCOME] };
  }

  try {
    const session = await withDbRetry(
      () =>
        prisma.aiChatSession.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          include: {
            messages: { orderBy: { createdAt: "asc" }, take: 100 },
          },
        }),
      "ai-chat-load",
      0,
    );

    if (session?.messages.length) {
      const out: ChatSession = {
        sessionId: session.id,
        messages: session.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        })),
      };
      writeFileSession(userId, out);
      return out;
    }
  } catch (err) {
    console.warn("[ai-chat] DB load failed:", (err as Error).message);
    if (cached) return cached;
  }

  return { sessionId: randomUUID(), messages: [WELCOME] };
}

export async function appendAiChatMessages(
  userId: string,
  sessionId: string | null,
  question: string,
  answer: string,
): Promise<{ sessionId: string }> {
  const existing = readFileSession(userId);
  let sid = sessionId ?? existing?.sessionId ?? randomUUID();

  const now = new Date().toISOString();
  const base: ChatMessage[] =
    existing && existing.sessionId === sid ? existing.messages : [WELCOME];

  const messages: ChatMessage[] = [
    ...base,
    { role: "user", content: question, createdAt: now },
    { role: "assistant", content: answer, createdAt: now },
  ];

  writeFileSession(userId, { sessionId: sid, messages });

  if (isPersistenceEnabled()) {
    try {
      let session = await prisma.aiChatSession.findFirst({
        where: { id: sid, userId },
      });
      if (!session) {
        session = await prisma.aiChatSession.create({
          data: { id: sid, userId, title: question.slice(0, 60) },
        });
        sid = session.id;
      }

      await prisma.aiChatMessage.createMany({
        data: [
          { sessionId: sid, role: "user", content: question },
          { sessionId: sid, role: "assistant", content: answer },
        ],
      });

      writeFileSession(userId, { sessionId: sid, messages });
    } catch (err) {
      console.warn("[ai-chat] DB append failed:", (err as Error).message);
    }
  }

  return { sessionId: sid };
}

export async function clearAiChatSession(userId: string): Promise<void> {
  writeFileSession(userId, { sessionId: randomUUID(), messages: [WELCOME] });

  if (!isPersistenceEnabled()) return;

  try {
    await prisma.aiChatSession.deleteMany({ where: { userId } });
  } catch (err) {
    console.warn("[ai-chat] DB clear failed:", (err as Error).message);
  }
}

export { WELCOME };

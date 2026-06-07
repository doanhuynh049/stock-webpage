"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownLite } from "@/components/ui/markdown-lite";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "Should I buy FPT?",
  "Analyze VCB",
  "Compare FPT vs CMG",
  "What's the market outlook today?",
  "Find undervalued stocks",
];

const WELCOME: Message = {
  role: "assistant",
  content:
    "## Xin chào!\n\nI'm your **Vietnam Stock AI Analyst**. Ask about any ticker, compare stocks, or get market insights.\n\nData refreshes at **morning** and **afternoon** sessions.",
};

const STORAGE_KEY = "vnstocks-ai-chat";

export function AiAnalystChat({ initialSymbol }: { initialSymbol?: string }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  const persistLocal = useCallback(
    (sid: string | null, msgs: Message[]) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sid, messages: msgs }));
      } catch {
        /* ignore quota */
      }
    },
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch("/api/ai/session");
        if (res.ok) {
          const data = (await res.json()) as {
            sessionId: string;
            messages: Message[];
          };
          if (!cancelled && data.messages?.length) {
            setSessionId(data.sessionId);
            setMessages(data.messages);
            persistLocal(data.sessionId, data.messages);
            setHydrated(true);
            return;
          }
        }
      } catch {
        /* fall through to localStorage */
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as { sessionId: string; messages: Message[] };
          if (!cancelled && data.messages?.length) {
            setSessionId(data.sessionId ?? null);
            setMessages(data.messages);
          }
        }
      } catch {
        /* ignore */
      }

      if (!cancelled) setHydrated(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [persistLocal]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });

      if (res.status === 401) {
        const errMsgs = [
          ...nextMessages,
          { role: "assistant" as const, content: "Please sign in to use the AI Analyst." },
        ];
        setMessages(errMsgs);
        return;
      }

      const data = await res.json();
      const sid = data.sessionId ?? sessionId;
      if (sid) setSessionId(sid);
      const providerNote =
        data.provider && data.provider !== "fallback"
          ? `\n\n*— ${data.provider}/${data.model}*`
          : "";
      const finalMsgs = [
        ...nextMessages,
        { role: "assistant" as const, content: data.answer + providerNote },
      ];
      setMessages(finalMsgs);
      persistLocal(sid ?? null, finalMsgs);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (loading) return;
    try {
      const res = await fetch("/api/ai/session", { method: "DELETE" });
      const data = res.ok
        ? ((await res.json()) as { sessionId: string; messages: Message[] })
        : null;
      const sid = data?.sessionId ?? null;
      const msgs = data?.messages?.length ? data.messages : [WELCOME];
      setSessionId(sid);
      setMessages(msgs);
      persistLocal(sid, msgs);
      autoSentRef.current = false;
    } catch {
      setSessionId(null);
      setMessages([WELCOME]);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  useEffect(() => {
    if (!hydrated || !initialSymbol || autoSentRef.current) return;
    autoSentRef.current = true;
    const q = `Analyze ${initialSymbol} — should I buy, hold, or sell based on the latest price, fundamentals, and technical indicators?`;
    void sendMessage(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot after session hydrate
  }, [hydrated, initialSymbol]);

  return (
    <div className="flex h-full min-h-[500px] flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--fg)]">VN Stock Analyst</p>
            <p className="text-[10px] text-subtle">Powered by market data · Updated 2× daily</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={clearChat}
          disabled={loading}
          className="text-xs text-muted"
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Clear chat
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-violet-500 to-indigo-500"
                  : "bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]"
              }`}
            >
              {msg.role === "user" ? (
                <User className="h-3.5 w-3.5 text-white" />
              ) : (
                <Bot className="h-3.5 w-3.5 text-accent" />
              )}
            </div>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-violet-500/10 text-[var(--fg)] ring-1 ring-violet-500/20"
                  : "bg-[var(--bg-secondary)] text-muted ring-1 ring-[var(--border)]"
              }`}
            >
              {msg.role === "assistant" ? (
                <MarkdownLite text={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]">
              <Bot className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-secondary)] px-4 py-3 ring-1 ring-[var(--border)]">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
              <span className="text-xs text-muted">Analyzing...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--border)] px-6 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 text-[11px] text-muted ring-1 ring-[var(--border)] transition-all hover:bg-[var(--accent-bg)] hover:text-accent hover:ring-[var(--accent)]/25"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Vietnamese stocks..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

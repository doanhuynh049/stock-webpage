"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function AiAnalystChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Xin chào! I'm your Vietnam Stock AI Analyst. Ask me about any ticker, compare stocks, or get market insights. Data refreshes at morning and afternoon sessions.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });

      if (res.status === 401) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Please sign in to use the AI Analyst." },
        ]);
        return;
      }

      const data = await res.json();
      if (data.sessionId) setSessionId(data.sessionId);
      const providerNote =
        data.provider && data.provider !== "fallback"
          ? `\n\n*— ${data.provider}/${data.model}*`
          : "";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer + providerNote },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-[500px] flex-col">
      <div className="border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--fg)]">VN Stock Analyst</p>
            <p className="text-[10px] text-subtle">Powered by market data · Updated 2× daily</p>
          </div>
        </div>
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
              <div className="whitespace-pre-wrap">{msg.content}</div>
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

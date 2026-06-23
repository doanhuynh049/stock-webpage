"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  Cpu,
  ChevronDown,
  ChevronUp,
  Search,
  Activity,
  Database,
  Newspaper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownLite } from "@/components/ui/markdown-lite";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AgentTraceStep = {
  thought: string;
  action?: string;
  observation?: string;
};

const SUGGESTIONS_BASIC = [
  "Should I buy FPT?",
  "Analyze VCB",
  "Compare FPT vs CMG",
  "What's the market outlook today?",
  "Find undervalued stocks",
];

const SUGGESTIONS_AGENT = [
  "Is FPT worth buying now? Check price, analysis and latest news",
  "Which banking stocks look best right now?",
  "Find high-ROE stocks and analyze the top pick",
  "What's driving the market today?",
  "Compare VCB and TCB fundamentals",
];

const WELCOME: Message = {
  role: "assistant",
  content:
    "## Xin chào!\n\nI'm your **Vietnam Stock AI Analyst**. Ask about any ticker, compare stocks, or get market insights.\n\nData refreshes at **morning** and **afternoon** sessions.",
};

const STORAGE_KEY      = "vnstocks-ai-chat";
const AGENT_MODE_KEY   = "vnstocks-ai-agent-mode";

// ─── Tool icon helper ──────────────────────────────────────────────────────

function toolIcon(action?: string) {
  if (!action) return null;
  if (action.startsWith("get_stock") || action.startsWith("analyze_stock"))
    return <Activity className="h-3 w-3 shrink-0 text-accent" />;
  if (action.startsWith("get_market"))
    return <Database className="h-3 w-3 shrink-0 text-accent" />;
  if (action.startsWith("search_news"))
    return <Newspaper className="h-3 w-3 shrink-0 text-accent" />;
  return <Search className="h-3 w-3 shrink-0 text-accent" />;
}

// ─── Agent trace display ──────────────────────────────────────────────────

function AgentTrace({ trace }: { trace: AgentTraceStep[] }) {
  const [open, setOpen] = useState(false);
  const steps = trace.filter((s) => s.action);
  if (!steps.length) return null;

  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-muted hover:text-[var(--fg)]"
      >
        <span className="flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-accent" />
          <span>
            Agent used {steps.length} tool{steps.length !== 1 ? "s" : ""}
          </span>
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-[var(--border)] px-3 pb-3 pt-2">
          {trace.map((step, i) => (
            <div key={i} className="space-y-1">
              {step.thought && (
                <p className="italic text-muted">
                  <span className="font-medium not-italic text-[var(--fg)]">Thought:</span>{" "}
                  {step.thought}
                </p>
              )}
              {step.action && (
                <div className="flex items-start gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5">
                  {toolIcon(step.action)}
                  <code className="break-all font-mono text-[10px] text-accent">
                    {step.action}
                  </code>
                </div>
              )}
              {step.observation && (
                <pre className="mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-muted ring-1 ring-[var(--border)]">
                  {step.observation}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main chat component ──────────────────────────────────────────────────

export function AiAnalystChat({ initialSymbol }: { initialSymbol?: string }) {
  const [messages, setMessages]   = useState<Message[]>([WELCOME]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hydrated, setHydrated]   = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [traces, setTraces]       = useState<Record<number, AgentTraceStep[]>>({});

  const bottomRef    = useRef<HTMLDivElement>(null);
  const autoSentRef  = useRef(false);

  const persistLocal = useCallback(
    (sid: string | null, msgs: Message[]) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId: sid, messages: msgs }));
      } catch { /* ignore quota */ }
    },
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Hydrate session + agent mode preference
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      // Restore agent mode preference
      try {
        const saved = localStorage.getItem(AGENT_MODE_KEY);
        if (saved === "true") setAgentMode(true);
      } catch { /* ignore */ }

      // Restore chat session
      try {
        const res = await fetch("/api/ai/session");
        if (res.ok) {
          const data = (await res.json()) as { sessionId: string; messages: Message[] };
          if (!cancelled && data.messages?.length) {
            setSessionId(data.sessionId);
            setMessages(data.messages);
            persistLocal(data.sessionId, data.messages);
            setHydrated(true);
            return;
          }
        }
      } catch { /* fall through to localStorage */ }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw) as { sessionId: string; messages: Message[] };
          if (!cancelled && data.messages?.length) {
            setSessionId(data.sessionId ?? null);
            setMessages(data.messages);
          }
        }
      } catch { /* ignore */ }

      if (!cancelled) setHydrated(true);
    }

    void hydrate();
    return () => { cancelled = true; };
  }, [persistLocal]);

  function toggleAgentMode() {
    setAgentMode((prev) => {
      const next = !prev;
      try { localStorage.setItem(AGENT_MODE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    setInput("");
    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setLoading(true);

    const endpoint = agentMode ? "/api/ai/agent" : "/api/ai";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });

      if (res.status === 401) {
        setMessages([
          ...nextMessages,
          { role: "assistant", content: "Please sign in to use the AI Analyst." },
        ]);
        return;
      }

      const data = (await res.json()) as {
        answer: string;
        sessionId?: string;
        provider?: string;
        model?: string;
        trace?: AgentTraceStep[];
        iterations?: number;
      };

      const sid = data.sessionId ?? sessionId;
      if (sid) setSessionId(sid);

      const providerNote =
        data.provider && data.provider !== "fallback"
          ? `\n\n*— ${data.provider}/${data.model}${agentMode && data.iterations ? ` · ${data.iterations} step${data.iterations !== 1 ? "s" : ""}` : ""}*`
          : "";

      const finalMsgs: Message[] = [
        ...nextMessages,
        { role: "assistant", content: data.answer + providerNote },
      ];

      // Store trace keyed by the new assistant message index
      if (agentMode && data.trace?.length) {
        setTraces((prev) => ({ ...prev, [finalMsgs.length - 1]: data.trace! }));
      }

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
    setTraces({});
    try {
      const res = await fetch("/api/ai/session", { method: "DELETE" });
      const data = res.ok
        ? ((await res.json()) as { sessionId: string; messages: Message[] })
        : null;
      const sid  = data?.sessionId ?? null;
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
    const q = agentMode
      ? `Analyze ${initialSymbol} — fetch live price, technical analysis, and latest news, then give a buy/hold/sell recommendation.`
      : `Analyze ${initialSymbol} — should I buy, hold, or sell based on the latest price, fundamentals, and technical indicators?`;
    void sendMessage(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot after session hydrate
  }, [hydrated, initialSymbol]);

  const suggestions = agentMode ? SUGGESTIONS_AGENT : SUGGESTIONS_BASIC;

  return (
    <div className="flex h-full min-h-[min(24rem,calc(100dvh-11rem))] flex-col md:min-h-[min(28rem,calc(100dvh-8rem))]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]">
            {agentMode ? (
              <Cpu className="h-4 w-4 text-accent-fg" />
            ) : (
              <Sparkles className="h-4 w-4 text-accent-fg" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--fg)]">
              {agentMode ? "VN Agent Analyst" : "VN Stock Analyst"}
            </p>
            <p className="hidden text-[10px] text-subtle sm:block">
              {agentMode
                ? "Agentic RAG · fetches live data per question"
                : "Powered by market data · Updated 2× daily"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Agent mode toggle */}
          <button
            onClick={toggleAgentMode}
            title={agentMode ? "Switch to Basic mode" : "Switch to Agent mode"}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium ring-1 transition-all ${
              agentMode
                ? "bg-accent text-accent-fg ring-accent/50"
                : "bg-[var(--bg-secondary)] text-muted ring-[var(--border)] hover:bg-[var(--accent-bg)] hover:text-accent"
            }`}
          >
            <Cpu className="h-3 w-3" />
            <span className="hidden sm:inline">Agent</span>
          </button>

          <Button
            type="button"
            variant="ghost"
            onClick={clearChat}
            disabled={loading}
            className="px-2 text-xs text-muted sm:px-3"
          >
            <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:space-y-5 sm:px-6 sm:py-5">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
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

            <div className="min-w-0 max-w-[min(85%,32rem)] sm:max-w-[75%]">
              <div
                className={`rounded-2xl px-3 py-2.5 text-sm leading-relaxed sm:px-4 sm:py-3 ${
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

              {/* Agent trace — only for assistant messages with a stored trace */}
              {msg.role === "assistant" && traces[i] && (
                <AgentTrace trace={traces[i]} />
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]">
              <Bot className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[var(--bg-secondary)] px-4 py-3 ring-1 ring-[var(--border)]">
              <span className="flex gap-1">
                {[0, 1, 2].map((j) => (
                  <span
                    key={j}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]"
                    style={{ animationDelay: `${j * 150}ms` }}
                  />
                ))}
              </span>
              <span className="text-xs text-muted">
                {agentMode ? "Agent reasoning…" : "Analyzing…"}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] px-3 py-3 safe-bottom sm:px-6 sm:py-4">
        <div className="tab-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-3 py-2 text-[11px] text-muted ring-1 ring-[var(--border)] transition-all hover:bg-[var(--accent-bg)] hover:text-accent hover:ring-[var(--accent)]/25 sm:py-1.5"
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
            placeholder={
              agentMode
                ? "Ask anything — agent will fetch live data…"
                : "Ask about Vietnamese stocks…"
            }
            disabled={loading}
            className="min-h-10 flex-1 text-base sm:text-sm"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-10 w-10 shrink-0 px-0 sm:h-auto sm:w-auto sm:px-4"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

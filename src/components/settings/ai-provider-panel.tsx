"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2,
  Eye, EyeOff, ExternalLink, KeyRound, Loader2, PlayCircle, RefreshCw, Sparkles, XCircle, Zap,
} from "lucide-react";
import { LLM_PROVIDERS } from "@/lib/providers/llm";
import type { AiSettings, ProviderConfig } from "@/app/api/settings/ai/route";
import type { ModelInfo } from "@/app/api/settings/ai/models/route";
import type { TestProviderResponse } from "@/app/api/settings/ai/test/route";
import type { AutoSelectResponse } from "@/app/api/settings/ai/auto-select/route";

type ProviderId = ProviderConfig["id"];

const PROVIDER_COLORS: Record<string, string> = {
  cerebras:    "text-orange-500  bg-orange-500/10  ring-orange-500/20",
  groq:        "text-violet-500  bg-violet-500/10  ring-violet-500/20",
  gemini:      "text-blue-500    bg-blue-500/10    ring-blue-500/20",
  mistral:     "text-rose-500    bg-rose-500/10    ring-rose-500/20",
  openrouter:  "text-emerald-500 bg-emerald-500/10 ring-emerald-500/20",
  sambanova:   "text-amber-500   bg-amber-500/10   ring-amber-500/20",
  cohere:      "text-fuchsia-500 bg-fuchsia-500/10 ring-fuchsia-500/20",
  huggingface: "text-yellow-500  bg-yellow-500/10  ring-yellow-500/20",
  cloudflare:  "text-orange-600  bg-orange-600/10  ring-orange-600/20",
  ollama:      "text-slate-500   bg-slate-500/10   ring-slate-500/20",
  llm7:        "text-cyan-500    bg-cyan-500/10    ring-cyan-500/20",
};

function KeyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center">
      <KeyRound className="absolute left-3 h-3.5 w-3.5 text-muted pointer-events-none" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] py-1.5 pl-9 pr-9 text-xs text-[var(--fg)] placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 text-muted hover:text-[var(--fg)]"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AiProviderPanel() {
  const [settings, setSettings]   = useState<AiSettings | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [saving,   setSaving]     = useState(false);
  const [saved,    setSaved]      = useState(false);
  const [models,   setModels]     = useState<Record<string, ModelInfo[]>>({});
  const [fetching, setFetching]   = useState<Record<string, boolean>>({});
  const [testing,  setTesting]    = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestProviderResponse>>({});
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [autoSelectError, setAutoSelectError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.ok ? r.json() as Promise<AiSettings> : null)
      .then((d) => { if (d) setSettings(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchModels = useCallback(async (id: ProviderId) => {
    setFetching((f) => ({ ...f, [id]: true }));
    try {
      const res = await fetch(`/api/settings/ai/models?provider=${id}`);
      if (res.ok) {
        const { models: list } = await res.json() as { models: ModelInfo[] };
        // Deduplicate by id — some providers return the same model under multiple aliases
        const unique = list.filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx);
        setModels((m) => ({ ...m, [id]: unique }));
      }
    } catch {/* silent */}
    finally { setFetching((f) => ({ ...f, [id]: false })); }
  }, []);

  // Tests the row's current (possibly unsaved) model + API key with a real,
  // tiny chat completion — confirms the model actually responds before saving.
  const runTest = useCallback(async (cfg: ProviderConfig) => {
    setTesting((t) => ({ ...t, [cfg.id]: true }));
    setTestResults((r) => ({ ...r, [cfg.id]: undefined as unknown as TestProviderResponse }));
    try {
      const res = await fetch("/api/settings/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cfg.id, model: cfg.model, apiKey: cfg.apiKey }),
      });
      const data = (await res.json()) as TestProviderResponse;
      setTestResults((r) => ({ ...r, [cfg.id]: data }));
    } catch {
      setTestResults((r) => ({
        ...r,
        [cfg.id]: { ok: false, message: "Request failed — check your network connection.", latencyMs: 0 },
      }));
    } finally {
      setTesting((t) => ({ ...t, [cfg.id]: false }));
    }
  }, []);

  // For every enabled provider, ranks its known models and tests candidates
  // until one actually responds — then fills in that model (unsaved, so the
  // user can review before hitting "Save changes").
  const autoSelectBestModels = useCallback(async () => {
    if (!settings) return;
    const enabledRows = settings.providers.filter((p) => p.enabled);
    if (!enabledRows.length) {
      setAutoSelectError("No enabled providers to auto-detect.");
      return;
    }

    setAutoSelecting(true);
    setAutoSelectError(null);
    setTesting((t) => {
      const next = { ...t };
      for (const p of enabledRows) next[p.id] = true;
      return next;
    });

    try {
      const res = await fetch("/api/settings/ai/auto-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: enabledRows.map((p) => ({ id: p.id, apiKey: p.apiKey, enabled: p.enabled })),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const { results } = (await res.json()) as AutoSelectResponse;

      setSettings((s) => {
        if (!s) return s;
        return {
          ...s,
          providers: s.providers.map((p) => {
            const r = results[p.id];
            return r?.ok && r.model && r.model !== p.model ? { ...p, model: r.model } : p;
          }),
        };
      });
      setTestResults((prev) => {
        const next = { ...prev };
        for (const [id, r] of Object.entries(results)) {
          next[id] = { ok: r.ok, message: r.message, latencyMs: r.latencyMs };
        }
        return next;
      });
    } catch (e) {
      setAutoSelectError(e instanceof Error ? e.message : "Auto-detect failed — check your network connection.");
    } finally {
      setAutoSelecting(false);
      setTesting((t) => {
        const next = { ...t };
        for (const p of enabledRows) next[p.id] = false;
        return next;
      });
    }
  }, [settings]);

  const save = async (overrideSettings?: AiSettings) => {
    const toSave = overrideSettings ?? settings;
    if (!toSave) return;
    setSaving(true);
    try {
      await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSave),
      });
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch {/* silent */}
    finally { setSaving(false); }
  };

  const updateProvider = (id: ProviderId, patch: Partial<ProviderConfig>) => {
    setSettings((s) => {
      if (!s) return s;
      const next = {
        ...s,
        providers: s.providers.map((p) => p.id === id ? { ...p, ...patch } : p),
      };
      return next;
    });
    // Stale result once the tested config (model/key) changes
    if ("model" in patch || "apiKey" in patch) {
      setTestResults((r) => ({ ...r, [id]: undefined as unknown as TestProviderResponse }));
    }
  };

  const move = (id: ProviderId, dir: -1 | 1) => {
    setSettings((s) => {
      if (!s) return s;
      const arr = [...s.providers].sort((a, b) => a.priority - b.priority);
      const idx = arr.findIndex((p) => p.id === id);
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return s;
      [arr[idx].priority, arr[target].priority] = [arr[target].priority, arr[idx].priority];
      return { ...s, providers: arr };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!settings) return null;

  const sorted = [...settings.providers].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--fg)]">Provider Priority & Models</h2>
          <p className="mt-0.5 text-xs text-muted">
            Use arrows to reorder. Enable any provider even without an env key — enter your key below.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void autoSelectBestModels()}
            disabled={autoSelecting || saving}
            title="Ranks each enabled provider's known models and tests candidates until one responds, then fills in the best working model."
            className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[var(--fg)] ring-1 ring-[var(--border-strong)] transition hover:bg-[var(--bg-secondary)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {autoSelecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {autoSelecting ? "Finding best models…" : "Auto-detect best models"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" />
             : saved ? <CheckCircle2 className="h-4 w-4" />
             : null}
            {saved ? "Saved!" : "Save changes"}
          </button>
        </div>
      </div>
      {autoSelectError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/5 px-3 py-2 text-[11px] text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{autoSelectError}</p>
        </div>
      )}

      {/* Provider rows */}
      <div className="space-y-3">
        {sorted.map((cfg, i) => {
          const meta = LLM_PROVIDERS.find((p) => p.id === cfg.id);
          if (!meta) return null;
          const colorCls = PROVIDER_COLORS[cfg.id] ?? "text-muted bg-[var(--bg-secondary)] ring-[var(--border)]";
          const modelList = models[cfg.id] ?? [];
          const isFetching = fetching[cfg.id];
          const isTesting = testing[cfg.id];
          const testResult = testResults[cfg.id];
          const hasEnvKey = cfg.enabled && !cfg.apiKey; // rough heuristic: was active before user edit

          return (
            <div
              key={cfg.id}
              className={`overflow-hidden rounded-xl ring-1 transition-all ${
                cfg.enabled
                  ? "bg-[var(--card)] ring-[var(--border-strong)]"
                  : "ring-[var(--border)] opacity-70"
              }`}
            >
              {/* Row header */}
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Priority badge */}
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ring-1 ${colorCls}`}>
                  {i + 1}
                </div>

                {/* Name + tier */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[var(--fg)]">{meta.name}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${colorCls}`}>
                      {meta.tier}
                    </span>
                    <span className="text-[10px] text-muted">{meta.speed}</span>
                    <a href={meta.url} target="_blank" rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-0.5 rounded text-[10px] text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                      Get key <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <p className="text-[10px] text-subtle">{meta.envKey}</p>
                </div>

                {/* Enable/disable toggle */}
                <button
                  type="button"
                  onClick={() => updateProvider(cfg.id, { enabled: !cfg.enabled })}
                  className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold ring-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                    cfg.enabled
                      ? "bg-accent/10 text-accent ring-accent/20 hover:bg-accent/20"
                      : "bg-[var(--bg-secondary)] text-muted ring-[var(--border)] hover:text-[var(--fg)]"
                  }`}
                >
                  {cfg.enabled ? "Enabled" : "Disabled"}
                </button>

                {/* Move up/down */}
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => move(cfg.id, -1)} disabled={i === 0}
                    className="rounded p-1 text-muted hover:text-[var(--fg)] disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => move(cfg.id, 1)} disabled={i === sorted.length - 1}
                    className="rounded p-1 text-muted hover:text-[var(--fg)] disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded config (only when enabled) */}
              {cfg.enabled && (
                <div className="space-y-3 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                  {/* API key input */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      <KeyRound className="h-3 w-3" />
                      API Key
                      {hasEnvKey && (
                        <span className="ml-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                          ✓ set via env var
                        </span>
                      )}
                    </label>
                    <KeyInput
                      value={cfg.apiKey ?? ""}
                      onChange={(v) => updateProvider(cfg.id, { apiKey: v || undefined })}
                      placeholder={hasEnvKey ? "Using server env var — paste to override" : `Paste your ${meta.name} API key`}
                    />
                    {!hasEnvKey && !cfg.apiKey && (
                      <p className="flex items-center gap-1 text-[10px] text-amber-500">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        No env key found. Enter a key above to activate this provider.
                      </p>
                    )}
                  </div>

                  {/* Model selector */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted">Model</span>
                    <select
                      value={cfg.model}
                      onChange={(e) => updateProvider(cfg.id, { model: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-accent/40"
                    >
                      {/* Current model always first; merge with fetched list, deduplicate by id */}
                      {(() => {
                        const currentInList = modelList.some((m) => m.id === cfg.model);
                        const opts = currentInList
                          ? modelList
                          : [{ id: cfg.model, name: cfg.model } as ModelInfo, ...modelList];
                        return opts.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name ?? m.id}
                            {m.free ? " (free)" : ""}
                            {m.contextLength ? ` — ${(m.contextLength / 1000).toFixed(0)}k ctx` : ""}
                          </option>
                        ));
                      })()}
                    </select>
                    <button
                      type="button"
                      onClick={() => void fetchModels(cfg.id)}
                      disabled={isFetching}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-muted ring-1 ring-[var(--border)] transition-all hover:text-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {isFetching ? "Loading…" : "Latest models"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runTest(cfg)}
                      disabled={isTesting}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-semibold text-accent ring-1 ring-accent/20 transition-all hover:bg-accent/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                      {isTesting ? "Testing…" : "Run test"}
                    </button>
                  </div>

                  {/* Test result */}
                  {testResult && (
                    <div
                      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] ring-1 ${
                        testResult.ok
                          ? "bg-emerald-500/5 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400"
                          : "bg-red-500/5 text-red-600 ring-red-500/20 dark:text-red-400"
                      }`}
                    >
                      {testResult.ok
                        ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {testResult.ok ? `Model responded in ${testResult.latencyMs}ms` : "Test failed"}
                        </p>
                        <p className="break-words text-[10px] opacity-80">{testResult.message}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Free provider links */}
      <div className="rounded-xl bg-[var(--bg-secondary)] p-4 ring-1 ring-[var(--border)]">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Free API key providers
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
          {LLM_PROVIDERS.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg p-2.5 ring-1 ring-[var(--border)] transition-all hover:bg-[var(--card)] hover:ring-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              <Zap className={`h-3.5 w-3.5 shrink-0 ${PROVIDER_COLORS[p.id]?.split(" ")[0]}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--fg)]">{p.name}</p>
                <p className="text-[10px] text-muted">{p.tier}</p>
              </div>
              <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-subtle" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

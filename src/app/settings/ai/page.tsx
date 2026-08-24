import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLlmStatus, LLM_PROVIDERS } from "@/lib/providers/llm";
import { AiProviderPanel } from "@/components/settings/ai-provider-panel";
import { CheckCircle2, XCircle } from "lucide-react";

export default async function AiSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const status = getLlmStatus();

  const providerStatus = LLM_PROVIDERS.map((p) => ({
    id:     p.id,
    name:   p.name,
    active: status[p.id as keyof typeof status] as boolean,
    model:  status[`${p.id}Model` as keyof typeof status] as string,
    url:    p.url,
    tier:   p.tier,
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--fg)]">AI Configuration</h1>
        <p className="mt-1 text-sm text-muted">
          Manage AI providers, models, and priority order. The first enabled provider with a valid key is used for all AI calls.
        </p>
      </div>

      {/* Live key status */}
      <div className="glass-card rounded-2xl p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Server API key status
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-5">
          {providerStatus.map(({ id, name, active, model, url, tier }) => (
            <a key={id} href={url} target="_blank" rel="noopener noreferrer"
              className={`flex flex-col gap-1.5 rounded-xl p-3 ring-1 transition-all hover:ring-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                active ? "bg-emerald-500/5 ring-emerald-500/20" : "ring-[var(--border)]"
              }`}>
              <div className="flex items-center gap-1.5">
                {active
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  : <XCircle     className="h-3.5 w-3.5 shrink-0 text-muted opacity-40" />
                }
                <span className={`text-xs font-semibold ${active ? "text-[var(--fg)]" : "text-muted"}`}>{name}</span>
              </div>
              <p className="truncate text-[10px] text-muted">{active ? model : "No env key"}</p>
              <p className="text-[9px] text-subtle">{tier}</p>
            </a>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-subtle">
          Active: <span className="font-bold text-accent">{status.activeProvider}</span> ·
          Env vars are read-only from the server. Add or override keys below (stored in DB, personal use only).
        </p>
      </div>

      {/* Interactive panel */}
      <div className="glass-card rounded-2xl p-5">
        <AiProviderPanel />
      </div>

      {/* How to activate */}
      <div className="rounded-xl border border-dashed border-[var(--border)] p-4">
        <p className="mb-2 text-xs font-semibold text-[var(--fg)]">How to activate a provider</p>
        <ol className="list-inside list-decimal space-y-1 text-xs text-muted">
          <li>Get a free API key from the provider link (click any card above)</li>
          <li>Paste it in the <strong>API key</strong> field below — or add it to <code className="rounded bg-[var(--bg-secondary)] px-1">.env</code> / Vercel env vars</li>
          <li>Keys entered here are saved to the database and used for all AI calls on this account</li>
          <li>Env var keys take priority over UI-entered keys only at the server level</li>
        </ol>
      </div>
    </div>
  );
}

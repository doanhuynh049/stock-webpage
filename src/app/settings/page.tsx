import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getLlmStatus } from "@/lib/providers/llm";
import { ArrowRight, Bot, Shield, Sliders } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { user } = session;
  const initial = (user.name || user.email || "U").charAt(0).toUpperCase();
  const status  = getLlmStatus();

  const sections = [
    {
      href:  "/settings/ai",
      icon:  Bot,
      color: "text-violet-500 bg-violet-500/10 ring-violet-500/20",
      title: "AI Configuration",
      desc:  "Choose providers, set API keys, pick models, and rank which AI to call first. Fetch latest available models live.",
      meta:  `Active: ${status.activeProvider}`,
    },
    {
      href:  "/settings/reports",
      icon:  Sliders,
      color: "text-blue-500 bg-blue-500/10 ring-blue-500/20",
      title: "Reports & Alerts",
      desc:  "Weekly/monthly portfolio summaries, earnings beat/miss alerts, and price movement notifications to email or Slack.",
      meta:  "Email · Slack",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-[var(--fg)]">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your account, AI providers, and notification preferences.</p>
      </div>

      {/* Account card */}
      <div className="glass-card rounded-2xl p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Account</p>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-xl font-black text-accent">
            {initial}
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--fg)]">{user.name || "Investor"}</p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            <Shield className="h-3.5 w-3.5" /> Active session
          </div>
        </div>
      </div>

      {/* Setting tiles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map(({ href, icon: Icon, color, title, desc, meta }) => (
          <Link
            key={href}
            href={href}
            className="glass-card glass-card-hover group flex flex-col gap-4 rounded-2xl p-5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-xl p-3 ring-1 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <ArrowRight className="mt-1 h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </div>
            <div>
              <p className="font-semibold text-[var(--fg)]">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{desc}</p>
            </div>
            <p className="text-[10px] font-semibold text-accent">{meta}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle2, Clock, Loader2, Mail, MessageSquare } from "lucide-react";

type Frequency = "daily" | "weekly" | "monthly" | "off";

type ReportConfig = {
  email:           string;
  slackWebhook:    string;
  preferredTime:   string;
  // scheduled
  portfolioReport: Frequency;
  weeklyDigest:    boolean;
  monthlyReview:   boolean;
  // real-time
  tradeAlert:      boolean;
  earningsBeat:    boolean;
  earningsMiss:    boolean;
  priceAlert:      boolean;
  priceAlertPct:   number;
};

const DEFAULT: ReportConfig = {
  email:           "",
  slackWebhook:    "",
  preferredTime:   "08:00",
  portfolioReport: "weekly",
  weeklyDigest:    true,
  monthlyReview:   true,
  tradeAlert:      true,
  earningsBeat:    true,
  earningsMiss:    true,
  priceAlert:      false,
  priceAlertPct:   5,
};

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  desc,
  tag,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
  tag?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange(!checked)}
      className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3 ring-1 ring-[var(--border)] transition-all hover:ring-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--fg)]">{label}</p>
          {tag && (
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${
              checked
                ? "bg-accent/10 text-accent ring-accent/20"
                : "bg-[var(--bg-secondary)] text-subtle ring-[var(--border)]"
            }`}>{tag}</span>
          )}
        </div>
        {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
      </div>
      {/* Pill toggle */}
      <div
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
          checked ? "bg-accent" : "bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </div>
    </div>
  );
}

// ─── Frequency selector (also toggle-styled) ─────────────────────────────────

function FrequencyRow({
  value,
  onChange,
  label,
  desc,
}: {
  value: Frequency;
  onChange: (v: Frequency) => void;
  label: string;
  desc?: string;
}) {
  const FREQS: Frequency[] = ["daily", "weekly", "monthly", "off"];
  return (
    <div className="rounded-xl px-4 py-3 ring-1 ring-[var(--border)]">
      <div className="mb-2.5">
        <p className="text-sm font-medium text-[var(--fg)]">{label}</p>
        {desc && <p className="text-xs text-muted">{desc}</p>}
      </div>
      <div className="flex gap-1.5">
        {FREQS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold ring-1 transition-all capitalize ${
              value === f
                ? "bg-accent text-accent-fg ring-accent/30 shadow-sm"
                : "text-muted bg-[var(--bg-secondary)] ring-[var(--border)] hover:text-[var(--fg)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportSettingsPanel() {
  const [cfg,    setCfg]    = useState<ReportConfig>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vnstocks:report-settings");
      if (raw) setCfg({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {/* ignore */}
  }, []);

  const save = () => {
    setSaving(true);
    try {
      localStorage.setItem("vnstocks:report-settings", JSON.stringify(cfg));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  };

  const set = (patch: Partial<ReportConfig>) => setCfg((c) => ({ ...c, ...patch }));

  return (
    <div className="space-y-6">
      {/* Save bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--fg)]">Reports & Alerts</h2>
          <p className="mt-0.5 text-xs text-muted">Settings are saved locally in your browser.</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : null}
          {saved ? "Saved!" : "Save"}
        </button>
      </div>

      {/* ── Delivery ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Delivery</p>
        <div className="glass-card rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 shrink-0 text-muted" />
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--fg)] mb-1.5">Email address</label>
              <input
                type="email"
                value={cfg.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted" />
            <div className="flex-1">
              <label className="block text-xs font-medium text-[var(--fg)] mb-1.5">
                Slack webhook URL <span className="font-normal text-subtle">(optional)</span>
              </label>
              <input
                type="url"
                value={cfg.slackWebhook}
                onChange={(e) => set({ slackWebhook: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 shrink-0 text-muted" />
            <div>
              <label className="block text-xs font-medium text-[var(--fg)] mb-1.5">
                Preferred delivery time <span className="font-normal text-subtle">(Vietnam time, UTC+7)</span>
              </label>
              <input
                type="time"
                value={cfg.preferredTime}
                onChange={(e) => set({ preferredTime: e.target.value })}
                className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Scheduled Reports ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Scheduled Reports</p>
        <div className="space-y-2">
          <FrequencyRow
            value={cfg.portfolioReport}
            onChange={(v) => set({ portfolioReport: v })}
            label="Portfolio Summary"
            desc="Holdings P/L, sector allocation, top movers"
          />
          <Toggle
            checked={cfg.weeklyDigest}
            onChange={(v) => set({ weeklyDigest: v })}
            label="Weekly Market Digest"
            desc="VN market summary, sector trends, top BEAT/MISS earnings"
            tag="Weekly"
          />
          <Toggle
            checked={cfg.monthlyReview}
            onChange={(v) => set({ monthlyReview: v })}
            label="Monthly Portfolio Review"
            desc="Full performance report with P/L attribution"
            tag="Monthly"
          />
        </div>
      </section>

      {/* ── Real-time Alerts ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Real-time Alerts</p>
        <div className="space-y-2">
          <Toggle
            checked={cfg.tradeAlert}
            onChange={(v) => set({ tradeAlert: v })}
            label="Trade Confirmation"
            desc="Alert when a trade is recorded or deleted"
          />
          <Toggle
            checked={cfg.earningsBeat}
            onChange={(v) => set({ earningsBeat: v })}
            label="Earnings Beat Alert"
            desc="Alert when a stock in your portfolio beats estimates"
            tag="BEAT"
          />
          <Toggle
            checked={cfg.earningsMiss}
            onChange={(v) => set({ earningsMiss: v })}
            label="Earnings Miss Alert"
            desc="Alert when a portfolio stock misses estimates"
            tag="MISS"
          />
          <Toggle
            checked={cfg.priceAlert}
            onChange={(v) => set({ priceAlert: v })}
            label="Price Movement Alert"
            desc={`Alert when a portfolio stock moves more than ±${cfg.priceAlertPct}% in a session`}
          />

          {cfg.priceAlert && (
            <div className="flex items-center gap-4 rounded-xl bg-[var(--bg-secondary)] px-4 py-3 ring-1 ring-[var(--border)]">
              <span className="shrink-0 text-xs text-muted">Threshold</span>
              <input
                type="range"
                min={2} max={20} step={1}
                value={cfg.priceAlertPct}
                onChange={(e) => set({ priceAlertPct: Number(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
              />
              <span className="w-12 shrink-0 text-right text-sm font-bold text-accent">±{cfg.priceAlertPct}%</span>
            </div>
          )}
        </div>
      </section>

      {/* Note */}
      <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center">
        <p className="text-xs text-muted">
          Email + Slack delivery activates once <code className="rounded bg-[var(--bg-secondary)] px-1">CRON_SECRET</code> is set
          and <code className="rounded bg-[var(--bg-secondary)] px-1">/api/cron/report</code> is wired to Vercel Cron.
          Alert preferences are already stored and will take effect once the cron job is enabled.
        </p>
      </div>
    </div>
  );
}

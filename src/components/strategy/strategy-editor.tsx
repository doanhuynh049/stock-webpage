"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  SECTOR_TARGET_LABELS,
  type StrategyConfig,
} from "@/lib/strategy/strategy-types";

export function StrategyEditor({
  config,
  defaults,
}: {
  config: StrategyConfig;
  defaults: StrategyConfig;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(config);

  const sectorSum = useMemo(
    () =>
      Object.values(draft.sectorTargets).reduce((s, v) => s + (Number(v) || 0), 0),
    [draft.sectorTargets],
  );

  function openEditor() {
    setDraft(config);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxPerStock: draft.maxPerStock,
          maxPerSector: draft.maxPerSector,
          takeProfitPct: draft.takeProfitPct,
          stopLossPct: draft.stopLossPct,
          coreTarget: draft.coreTarget,
          satelliteTarget: 100 - draft.coreTarget,
          sectorTargets: draft.sectorTargets,
          targetReturn: draft.targetReturn,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    try {
      await fetch("/api/strategy", { method: "DELETE" });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={openEditor}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit strategy
        </Button>
      </div>
    );
  }

  return (
    <Card className="!p-4 ring-2 ring-[var(--accent)]/25">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <CardTitle className="!mb-0 !text-base">Investment strategy</CardTitle>
          <p className="mt-1 text-xs text-subtle">
            Customize risk limits and sector targets. Review updates immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-muted hover:bg-[var(--bg-secondary)]"
          aria-label="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Max per stock %"
          value={draft.maxPerStock}
          onChange={(v) => setDraft((d) => ({ ...d, maxPerStock: v }))}
        />
        <Field
          label="Max per sector %"
          value={draft.maxPerSector}
          onChange={(v) => setDraft((d) => ({ ...d, maxPerSector: v }))}
        />
        <Field
          label="Take profit %"
          value={draft.takeProfitPct}
          onChange={(v) => setDraft((d) => ({ ...d, takeProfitPct: v }))}
        />
        <Field
          label="Stop loss %"
          value={draft.stopLossPct}
          onChange={(v) => setDraft((d) => ({ ...d, stopLossPct: v }))}
          allowNegative
        />
        <Field
          label="Core allocation %"
          value={draft.coreTarget}
          onChange={(v) =>
            setDraft((d) => ({
              ...d,
              coreTarget: v,
              satelliteTarget: 100 - v,
            }))
          }
        />
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-subtle">
            Target return
          </label>
          <Input
            value={draft.targetReturn}
            onChange={(e) =>
              setDraft((d) => ({ ...d, targetReturn: e.target.value }))
            }
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--fg)]">Sector targets</p>
          <span
            className={`text-[10px] ${
              Math.abs(sectorSum - 100) <= 1 ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            Sum: {sectorSum.toFixed(0)}% {Math.abs(sectorSum - 100) > 1 ? "(aim for 100%)" : ""}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(SECTOR_TARGET_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{label}</span>
              <Input
                type="number"
                className="w-20"
                value={draft.sectorTargets[key] ?? 0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setDraft((d) => ({
                    ...d,
                    sectorTargets: { ...d.sectorTargets, [key]: v },
                  }));
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          Save strategy
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDraft(defaults)}
          disabled={saving}
        >
          Revert draft
        </Button>
        <Button type="button" variant="secondary" onClick={reset} disabled={saving}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  allowNegative,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium uppercase text-subtle">{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v)) return;
          if (!allowNegative && v < 0) return;
          onChange(v);
        }}
      />
    </div>
  );
}

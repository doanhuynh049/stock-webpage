"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { SCREENER_DEFAULTS } from "@/lib/screener-defaults";

export function ScreenerForm({
  sectors,
  defaults,
}: {
  sectors: string[];
  defaults: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const formDefaults = {
    maxPe: defaults.maxPe ?? SCREENER_DEFAULTS.maxPe,
    minRevenueGrowth: defaults.minRevenueGrowth ?? SCREENER_DEFAULTS.minRevenueGrowth,
    minRoe: defaults.minRoe ?? SCREENER_DEFAULTS.minRoe,
    maxRsi: defaults.maxRsi ?? SCREENER_DEFAULTS.maxRsi,
    sector: defaults.sector ?? "",
  };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    const maxPe = String(form.get("maxPe") ?? "").trim() || SCREENER_DEFAULTS.maxPe;
    const minRevenueGrowth =
      String(form.get("minRevenueGrowth") ?? "").trim() ||
      SCREENER_DEFAULTS.minRevenueGrowth;
    const minRoe = String(form.get("minRoe") ?? "").trim() || SCREENER_DEFAULTS.minRoe;
    const maxRsi = String(form.get("maxRsi") ?? "").trim() || SCREENER_DEFAULTS.maxRsi;
    const sector = String(form.get("sector") ?? "").trim();

    params.set("maxPe", maxPe);
    params.set("minRevenueGrowth", minRevenueGrowth);
    params.set("minRoe", minRoe);
    params.set("maxRsi", maxRsi);
    if (sector) params.set("sector", sector);

    startTransition(() => {
      router.push(`/screener?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>PE Ratio &lt;</Label>
        <Input
          name="maxPe"
          type="number"
          min={1}
          step={0.1}
          placeholder={SCREENER_DEFAULTS.maxPe}
          defaultValue={formDefaults.maxPe}
        />
      </div>
      <div>
        <Label>Revenue Growth &gt; %</Label>
        <Input
          name="minRevenueGrowth"
          type="number"
          min={0}
          step={0.1}
          placeholder={SCREENER_DEFAULTS.minRevenueGrowth}
          defaultValue={formDefaults.minRevenueGrowth}
        />
      </div>
      <div>
        <Label>ROE &gt; %</Label>
        <Input
          name="minRoe"
          type="number"
          min={0}
          step={0.1}
          placeholder={SCREENER_DEFAULTS.minRoe}
          defaultValue={formDefaults.minRoe}
        />
      </div>
      <div>
        <Label>RSI &lt;</Label>
        <Input
          name="maxRsi"
          type="number"
          min={1}
          max={100}
          step={1}
          placeholder={SCREENER_DEFAULTS.maxRsi}
          defaultValue={formDefaults.maxRsi}
        />
      </div>
      <div>
        <Label>Sector</Label>
        <Select name="sector" defaultValue={formDefaults.sector}>
          <option value="">All Sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={pending}>
          <Search className="h-4 w-4" />
          Run Screen
        </Button>
      </div>
    </form>
  );
}

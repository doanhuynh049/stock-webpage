"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";

export function ScreenerForm({
  sectors,
  defaults,
}: {
  sectors: string[];
  defaults: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (value) params.set(key, value as string);
    }
    startTransition(() => {
      router.push(`/screener?${params.toString()}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <Label>PE Ratio &lt;</Label>
        <Input name="maxPe" type="number" placeholder="15" defaultValue={defaults.maxPe} />
      </div>
      <div>
        <Label>Revenue Growth &gt; %</Label>
        <Input
          name="minRevenueGrowth"
          type="number"
          placeholder="20"
          defaultValue={defaults.minRevenueGrowth}
        />
      </div>
      <div>
        <Label>ROE &gt; %</Label>
        <Input name="minRoe" type="number" placeholder="15" defaultValue={defaults.minRoe} />
      </div>
      <div>
        <Label>RSI &lt;</Label>
        <Input name="maxRsi" type="number" placeholder="30" defaultValue={defaults.maxRsi} />
      </div>
      <div>
        <Label>Sector</Label>
        <Select name="sector" defaultValue={defaults.sector ?? ""}>
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

import {
  Building2,
  Cpu,
  Factory,
  Flame,
  HeartPulse,
  Landmark,
  Layers,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { getSectorColor } from "@/lib/sector-colors";
import { cn } from "@/lib/utils";

const SECTOR_ICONS: Record<string, LucideIcon> = {
  Technology: Cpu,
  Banking: Landmark,
  "Real Estate": Building2,
  Consumer: ShoppingBag,
  Industrial: Factory,
  Energy: Flame,
  Healthcare: HeartPulse,
  Materials: Layers,
  "Financial Services": Landmark,
};

export function StockAvatar({
  symbol,
  sector,
  size = "md",
}: {
  symbol: string;
  sector?: string;
  size?: "sm" | "md" | "lg";
}) {
  const color = getSectorColor(sector ?? "");
  const Icon = sector ? SECTOR_ICONS[sector] : null;
  const sizes = {
    sm: { box: "h-8 w-8", icon: "h-3.5 w-3.5", text: "text-[10px]" },
    md: { box: "h-10 w-10", icon: "h-4 w-4", text: "text-xs" },
    lg: { box: "h-12 w-12", icon: "h-5 w-5", text: "text-sm" },
  };
  const s = sizes[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold",
        s.box,
      )}
      style={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
        color,
        boxShadow: `inset 0 0 0 1px ${color}35`,
      }}
      title={sector ? `${symbol} · ${sector}` : symbol}
    >
      {Icon ? (
        <Icon className={cn(s.icon, "opacity-90")} strokeWidth={2.25} />
      ) : (
        <span className={s.text}>{symbol.slice(0, 2)}</span>
      )}
      {size !== "sm" && (
        <span
          className="absolute bottom-0 right-0 rounded-tl-md px-1 py-px font-mono text-[7px] font-semibold leading-none text-white"
          style={{ background: color }}
        >
          {symbol.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

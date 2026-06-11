import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type LogTradeLinkProps = {
  symbol?: string;
  price?: number;
  exchange?: string;
  sector?: string;
  variant?: "button" | "outline" | "link";
  className?: string;
  label?: string;
};

export function LogTradeLink({
  symbol,
  price,
  exchange,
  sector,
  variant = "button",
  className,
  label,
}: LogTradeLinkProps) {
  const params = new URLSearchParams({ add: "1" });
  if (symbol) params.set("symbol", symbol.toUpperCase());
  if (price != null && price > 0) params.set("price", String(price));
  if (exchange) params.set("exchange", exchange);
  if (sector) params.set("sector", sector);
  const href = `/trading?${params.toString()}`;

  const text = label ?? (variant === "link" ? "Log trade" : "Add trade");
  const Icon = variant === "link" ? ArrowLeftRight : Plus;

  if (variant === "link") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {text}
      </Link>
    );
  }

  if (variant === "outline") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] ring-1 ring-[var(--border)] hover:ring-[var(--accent)]/30",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {text}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-md ring-2 ring-accent/30 transition hover:opacity-90 hover:shadow-lg",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {text}
    </Link>
  );
}

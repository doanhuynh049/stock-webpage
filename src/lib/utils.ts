import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

export function formatMarketCap(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}T`;
  return `${value}B`;
}

export function formatPercent(value: number, showSign = true): string {
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCurrency(value: number): string {
  return `${formatNumber(value, 0)} ₫`;
}

/** Portfolio DB values are in thousands VND — display without a K suffix (stock-service style). */
export function formatPortfolioAmount(value: number, decimals = 2): string {
  return formatNumber(value, decimals);
}

/** @deprecated Use formatPortfolioAmount — kept for gradual migration */
export function formatPriceK(value: number, decimals = 2): string {
  return formatPortfolioAmount(value, decimals);
}

export function formatPortfolioPercent(value: number, decimals = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function changeColor(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "text-subtle";
}

/** ISO yyyy-mm-dd → dd/mm/yyyy */
export function formatDateDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** dd/mm/yyyy → ISO yyyy-mm-dd (null if invalid) */
export function parseDateDMY(dmy: string): string | null {
  const match = dmy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse user-typed amounts with vi-VN thousand separators (e.g. 25.000 or 25.000,5). */
export function parseFormattedNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const normalized = trimmed
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

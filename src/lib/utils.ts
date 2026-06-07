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

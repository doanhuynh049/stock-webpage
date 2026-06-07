export const SECTOR_COLORS: Record<string, string> = {
  Technology: "#8b5cf6",
  Banking: "#3b82f6",
  "Real Estate": "#f59e0b",
  Consumer: "#ec4899",
  Industrial: "#06b6d4",
  Energy: "#f97316",
  Healthcare: "#14b8a6",
  Materials: "#84cc16",
  "Financial Services": "#6366f1",
};

export function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? "#71717a";
}

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
  ETF: "#10b981",
};

/** Maps long full-form sector names to their canonical short key */
const SECTOR_ALIAS: Record<string, string> = {
  "Banking & Financial Services": "Banking",
  "Technology & Telecommunications": "Technology",
  "Consumer Goods & Retail": "Consumer",
  "Real Estate & Construction": "Real Estate",
  "Materials (Chemicals, Fertilizers, Mining)": "Materials",
  "Energy (Oil, Gas, Utilities)": "Energy",
  "Healthcare & Pharmaceuticals": "Healthcare",
  "Industrial Manufacturing": "Industrial",
  "ETF & Index Funds": "ETF",
};

/** Maps human-readable sector name → route sectorId (safe for client components). */
export const SECTOR_NAME_TO_ROUTE_ID: Record<string, string> = {
  "Banking & Financial Services": "BANKING_FINANCE",
  "Real Estate & Construction": "REAL_ESTATE_CONSTRUCTION",
  "Consumer Goods & Retail": "CONSUMER_RETAIL",
  "Manufacturing & Industrials": "MANUFACTURING_INDUSTRIALS",
  "Energy (Oil, Gas, Utilities)": "ENERGY",
  "Materials (Chemicals, Fertilizers, Mining)": "MATERIALS",
  "Technology & Telecommunications": "TECH_TELECOM",
  "Transportation & Logistics": "TRANSPORT_LOGISTICS",
  "Healthcare & Pharmaceuticals": "HEALTHCARE_PHARMA",
  "ETF & Index Funds": "ETF_INDEX",
};

/** Short display name for a sector (strips parenthetical details). */
export function shortSectorName(sector: string): string {
  if (SECTOR_ALIAS[sector]) return SECTOR_ALIAS[sector];
  // strip everything after " (" or " &"
  const idx = sector.indexOf(" (");
  if (idx > 0) return sector.slice(0, idx);
  const amp = sector.indexOf(" & ");
  if (amp > 0) return sector.slice(0, amp);
  return sector;
}

export function getSectorColor(sector: string): string {
  return (
    SECTOR_COLORS[sector] ??
    SECTOR_COLORS[SECTOR_ALIAS[sector] ?? ""] ??
    "#71717a"
  );
}

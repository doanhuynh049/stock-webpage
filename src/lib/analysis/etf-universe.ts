/**
 * Vietnamese ETF universe — metadata only (client-safe, no Node imports).
 * All ETFs listed on HOSE as of Jun 2026.
 * Data sourced from KIS ETF screener, Shinhan Market Radar (Jun 2026).
 *
 * AUM figures are approximate (billion VND, mid-2025 snapshot).
 * Benchmarks: VN30TR, VN Diamond, VNFIN Lead, VNFIN Select, VN100, VNX50, VN Midcap.
 *
 * Server-side analysis (analyzeEtfUniverse) lives in etf-analysis.ts.
 */

export type EtfInfo = {
  symbol: string;
  name: string;
  benchmark: string;
  manager: string;
  /** Approximate AUM in billion VND (null = newly listed / not available). */
  aumBnVnd: number | null;
};

export type EtfAnalysisRow = EtfInfo & {
  currentPrice: number;
  technicalScore: number;
  technicalRating: string;
  maTrend: string;
  momentum: string;
  supportResistance: string;
  source: string;
  /** false when the snapshot DB has no technical data for this ETF (score/indicators are defaults) */
  hasData: boolean;
};

/** Canonical list sorted by AUM descending (largest fund first). */
export const ETF_UNIVERSE: EtfInfo[] = [
  // VN30 group
  { symbol: "FUEVFVND",  name: "DCVFM VN Diamond",        benchmark: "VN Diamond",   manager: "DCVFM",        aumBnVnd: 12011 },
  { symbol: "E1VFVN30",  name: "DCVFM VN30",              benchmark: "VN30",         manager: "DCVFM",        aumBnVnd: 6688  },
  { symbol: "FUEKIV30",  name: "KIM Growth VN30",          benchmark: "VN30",         manager: "KIM",          aumBnVnd: 1665  },
  { symbol: "FUEMAVND",  name: "MAFM VN Diamond",          benchmark: "VN Diamond",   manager: "Mirae Asset",  aumBnVnd: 442   },
  { symbol: "FUEMAV30",  name: "MAFM VN30",                benchmark: "VN30",         manager: "Mirae Asset",  aumBnVnd: 387   },
  { symbol: "FUEVN100",  name: "VinaCapital VN100",        benchmark: "VN100",        manager: "VinaCapital",  aumBnVnd: 523   },
  { symbol: "FUESSVFL",  name: "SSIAM VNFIN Lead",         benchmark: "VNFIN Lead",   manager: "SSIAM",        aumBnVnd: 465   },
  { symbol: "FUEKIVFS",  name: "KIM Growth VNFIN Select",  benchmark: "VNFIN Select", manager: "KIM",          aumBnVnd: 301   },
  { symbol: "FUEDCMID",  name: "DCVFM VN Midcap",         benchmark: "VN Midcap",    manager: "DCVFM",        aumBnVnd: 345   },
  { symbol: "FUESSV30",  name: "SSIAM VN30",               benchmark: "VN30",         manager: "SSIAM",        aumBnVnd: 171   },
  { symbol: "FUESSV50",  name: "SSIAM VNX50",              benchmark: "VNX50",        manager: "SSIAM",        aumBnVnd: 120   },
  { symbol: "FUEKIVND",  name: "KIM Growth VN Diamond",    benchmark: "VN Diamond",   manager: "KIM",          aumBnVnd: 103   },
  { symbol: "FUEIP100",  name: "IPAAM VN100",              benchmark: "VN100",        manager: "IPAAM",        aumBnVnd: null  },
  { symbol: "FUEFCV50",  name: "FPT Capital VNX50",        benchmark: "VNX50",        manager: "FPT Capital",  aumBnVnd: null  },
  { symbol: "FUEBFVND",  name: "Bao Viet VN Diamond",      benchmark: "VN Diamond",   manager: "Bao Viet",     aumBnVnd: null  },
  { symbol: "FUEABVND",  name: "An Binh VN Diamond",       benchmark: "VN Diamond",   manager: "An Binh",      aumBnVnd: null  },
];

const ETF_META_MAP: Map<string, EtfInfo> = new Map(
  ETF_UNIVERSE.map((e) => [e.symbol.toUpperCase(), e]),
);

export function getEtfMeta(symbol: string): EtfInfo | undefined {
  return ETF_META_MAP.get(symbol.toUpperCase());
}

export const BENCHMARK_ORDER = [
  "VN30",
  "VN Diamond",
  "VNFIN Lead",
  "VNFIN Select",
  "VN100",
  "VNX50",
  "VN Midcap",
] as const;


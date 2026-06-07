export type StrategyConfig = {
  maxPerStock: number;
  maxPerSector: number;
  takeProfitPct: number;
  stopLossPct: number;
  nearLimitBuf: number;
  coreTarget: number;
  satelliteTarget: number;
  sectorTargets: Record<string, number>;
  targetReturn: string;
  goldenRules: string[];
};

export type UserStrategyOverrides = Partial<StrategyConfig>;

export const SECTOR_TARGET_LABELS: Record<string, string> = {
  BANKING_FINANCE: "Banking & Finance",
  REAL_ESTATE_CONSTRUCTION: "Real Estate & Construction",
  CONSUMER_RETAIL: "Consumer & Retail",
  MANUFACTURING_INDUSTRIALS: "Manufacturing & Industrials",
  ENERGY: "Energy",
  MATERIALS: "Materials",
  TECH_TELECOM: "Tech & Telecom",
  TRANSPORT_LOGISTICS: "Transport & Logistics",
  HEALTHCARE_PHARMA: "Healthcare & Pharma",
};

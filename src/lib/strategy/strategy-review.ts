import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";
import { getVN30Universe } from "@/lib/analysis/index-universe";
import {
  loadDefaultStrategyConfig,
  type StrategyConfig,
} from "@/lib/strategy/strategy-config";

export type AllocStatus = "OK" | "NEAR_LIMIT" | "OVER";
export type ExitTrigger = "NONE" | "STOP_LOSS" | "TAKE_PROFIT" | "TARGET_REACHED";
export type PrimaryAction =
  | "HOLD"
  | "STOP_LOSS"
  | "TAKE_PROFIT"
  | "TARGET_REACHED"
  | "TRIM"
  | "SECTOR_CAP"
  | "BUY_MORE"
  | "MONITOR_POSITION"
  | "REBALANCE_POSITION";

export type StrategyHoldingRow = {
  symbol: string;
  name: string | null;
  sector: string | null;
  shares: number;
  avgBuyPrice: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number;
  plPct: number;
  allocPct: number;
  allocStatus: AllocStatus;
  strategyBucket: "Core" | "Satellite";
  bucketCategory: string;
  target3Month: number | null;
  progress3M: number;
  exitTrigger: ExitTrigger;
  primaryAction: PrimaryAction;
  actionReason: string;
};

export type SectorRow = {
  sector: string;
  pct: number;
  status: AllocStatus;
  target: number | null;
  drift: number | null;
  targetStatus: "IN_BAND" | "OVER_TARGET" | "UNDER_TARGET" | "NO_TARGET";
};

export type StrategyReview = {
  totalCost: number;
  totalValue: number;
  totalPL: number;
  totalPLPct: number;
  maxPerStock: number;
  maxPerSector: number;
  takeProfitThreshold: number;
  stopLossThreshold: number;
  holdingMappings: StrategyHoldingRow[];
  sectorRows: SectorRow[];
  coreVsSatellite: {
    coreActual: number;
    coreTarget: number;
    satelliteActual: number;
    satelliteTarget: number;
    coreDrift: number;
    satelliteDrift: number;
  };
  trimCandidates: StrategyHoldingRow[];
  stopLossCandidates: StrategyHoldingRow[];
  takeProfitCandidates: StrategyHoldingRow[];
  sectorViolations: SectorRow[];
  urgentActionCount: number;
  overallCompliant: boolean;
  targetReturn: string;
  goldenRules: string[];
};

const vn30Set = new Set(
  getVN30Universe().map((s) => s.symbol.toUpperCase()),
);

function isEtfSymbol(symbol: string, sector?: string | null): boolean {
  const upper = symbol.toUpperCase();
  if (upper.startsWith("FUE") || upper.startsWith("E1") || upper.endsWith("VND")) {
    return true;
  }
  const s = (sector ?? "").toLowerCase();
  return s === "etf" || s === "exchange-traded fund";
}

function displaySector(h: EnrichedHolding): string {
  if (isEtfSymbol(h.symbol, h.sector)) return "ETF";
  return h.sector?.trim() || "Unknown";
}

function classifyBucket(sector: string | null, symbol: string): "Core" | "Satellite" {
  if (isEtfSymbol(symbol, sector)) return "Core";
  if (vn30Set.has(symbol.toUpperCase())) return "Core";
  return "Satellite";
}

function describeBucketCategory(sector: string | null, symbol: string): string {
  if (isEtfSymbol(symbol, sector)) return "Sector ETFs";
  const s = (sector ?? "").toLowerCase();
  if (s === "banking" || s === "finance" || s === "financial services") {
    return "Banking & Finance";
  }
  if (s.includes("consumer") || s === "retail") return "Consumer & Retail";
  if (s === "technology" || s === "tech") return "Growth Tech";
  if (s === "real estate") return "Real Estate";
  if (vn30Set.has(symbol.toUpperCase())) return "VN30 Bluechips";
  return "Diversified";
}

function displaySectorToTargetKey(displaySector: string): string | null {
  switch (displaySector.toLowerCase()) {
    case "banking":
    case "financial services":
    case "financials":
    case "finance":
    case "securities":
      return "BANKING_FINANCE";
    case "real estate":
      return "REAL_ESTATE_CONSTRUCTION";
    case "consumer":
    case "consumer staples":
    case "consumer discretionary":
    case "consumer goods":
    case "retail":
      return "CONSUMER_RETAIL";
    case "industrials":
    case "manufacturing":
    case "steel":
    case "industrial":
      return "MANUFACTURING_INDUSTRIALS";
    case "energy":
    case "utilities":
    case "oil & gas":
      return "ENERGY";
    case "materials":
      return "MATERIALS";
    case "technology":
    case "tech":
    case "telecom":
      return "TECH_TELECOM";
    case "transport":
    case "transportation":
    case "logistics":
      return "TRANSPORT_LOGISTICS";
    case "healthcare":
    case "pharma":
      return "HEALTHCARE_PHARMA";
    default:
      return null;
  }
}

function deriveActions(
  cfg: StrategyConfig,
  allocPct: number,
  plPct: number,
  exitTrigger: ExitTrigger,
  bucket: "Core" | "Satellite",
  sectorAllocPct: number,
  h: EnrichedHolding,
): PrimaryAction[] {
  if (exitTrigger === "STOP_LOSS") return ["STOP_LOSS"];
  if (exitTrigger === "TARGET_REACHED") {
    return allocPct > cfg.maxPerStock ? ["TARGET_REACHED", "TRIM"] : ["TARGET_REACHED"];
  }
  const actions: PrimaryAction[] = [];
  if (exitTrigger === "TAKE_PROFIT") actions.push("TAKE_PROFIT");
  if (allocPct > cfg.maxPerStock) {
    if (!actions.includes("TAKE_PROFIT")) actions.push("TRIM");
    return [...actions, "REBALANCE_POSITION"];
  }
  if (sectorAllocPct > cfg.maxPerSector) return ["SECTOR_CAP"];
  if (allocPct > cfg.maxPerStock - cfg.nearLimitBuf) return ["MONITOR_POSITION"];
  if (
    bucket === "Core" &&
    allocPct < cfg.maxPerStock * 0.5 &&
    plPct > cfg.stopLossPct &&
    !isEtfSymbol(h.symbol, h.sector)
  ) {
    const t3 = h.target3Month ?? 0;
    if (t3 <= 0 || h.avgBuyPrice <= 0 || t3 > h.avgBuyPrice * 0.98) {
      return ["BUY_MORE"];
    }
  }
  return actions.length ? actions : ["HOLD"];
}

function actionReason(
  cfg: StrategyConfig,
  action: PrimaryAction,
  allocPct: number,
  plPct: number,
  sectorAllocPct: number,
): string {
  switch (action) {
    case "BUY_MORE":
      return `Core under-weight (${allocPct.toFixed(1)}%)`;
    case "SECTOR_CAP":
      return `Sector ${sectorAllocPct.toFixed(1)}% > ${cfg.maxPerSector}% cap`;
    case "TRIM":
      return `Alloc ${allocPct.toFixed(1)}% > ${cfg.maxPerStock}% max`;
    case "MONITOR_POSITION":
      return "Near allocation limit";
    case "STOP_LOSS":
      return `Down ${plPct.toFixed(1)}%`;
    case "TAKE_PROFIT":
      return `Up ${plPct.toFixed(1)}% — consider taking profit`;
    case "TARGET_REACHED":
      return "3M target reached";
    default:
      return "Within strategy limits";
  }
}

export function getStrategyReview(
  holdings: EnrichedHolding[],
  config?: StrategyConfig,
): StrategyReview {
  const cfg = config ?? loadDefaultStrategyConfig();
  const sectorTargets = cfg.sectorTargets;

  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalValue = holdings.reduce(
    (s, h) => s + (h.currentValueK ?? h.costBasis),
    0,
  );
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  const sectorAllocMap = new Map<string, number>();
  for (const h of holdings) {
    const sec = displaySector(h);
    sectorAllocMap.set(sec, (sectorAllocMap.get(sec) ?? 0) + h.costBasis);
  }
  for (const [k, v] of sectorAllocMap) {
    sectorAllocMap.set(k, totalCost > 0 ? (v / totalCost) * 100 : 0);
  }

  const holdingMappings: StrategyHoldingRow[] = holdings.map((h) => {
    const currentPrice = h.currentPriceK;
    const currentValue = h.currentValueK ?? h.costBasis;
    const plPct =
      h.costBasis > 0 ? ((currentValue - h.costBasis) / h.costBasis) * 100 : 0;
    const allocPct = totalCost > 0 ? (h.costBasis / totalCost) * 100 : 0;

    let allocStatus: AllocStatus = "OK";
    if (allocPct > cfg.maxPerStock) allocStatus = "OVER";
    else if (allocPct > cfg.maxPerStock - cfg.nearLimitBuf) allocStatus = "NEAR_LIMIT";

    const bucket = classifyBucket(h.sector, h.symbol);
    const bucketCategory = describeBucketCategory(h.sector, h.symbol);

    const target3 = h.target3Month ?? 0;
    const t3Pct =
      h.avgBuyPrice > 0 && target3 > 0
        ? ((target3 - h.avgBuyPrice) / h.avgBuyPrice) * 100
        : 0;
    const progress3M =
      t3Pct > 0.01 ? Math.min(100, Math.max(0, (plPct / t3Pct) * 100)) : 0;

    let exitTrigger: ExitTrigger = "NONE";
    if (plPct <= cfg.stopLossPct) exitTrigger = "STOP_LOSS";
    else if (plPct >= cfg.takeProfitPct) exitTrigger = "TAKE_PROFIT";
    if (currentPrice != null && target3 > 0 && currentPrice >= target3) {
      exitTrigger = "TARGET_REACHED";
    }

    const sectorAllocPct = sectorAllocMap.get(displaySector(h)) ?? 0;
    const actions = deriveActions(cfg, allocPct, plPct, exitTrigger, bucket, sectorAllocPct, h);
    const primaryAction = actions[0];

    return {
      symbol: h.symbol,
      name: h.name,
      sector: h.sector,
      shares: h.shares,
      avgBuyPrice: h.avgBuyPrice,
      costBasis: h.costBasis,
      currentPrice,
      currentValue,
      plPct,
      allocPct,
      allocStatus,
      strategyBucket: bucket,
      bucketCategory,
      target3Month: h.target3Month,
      progress3M,
      exitTrigger,
      primaryAction,
      actionReason: actionReason(cfg, primaryAction, allocPct, plPct, sectorAllocPct),
    };
  });

  const sectorCosts = new Map<string, number>();
  for (const h of holdings) {
    const sec = displaySector(h);
    sectorCosts.set(sec, (sectorCosts.get(sec) ?? 0) + h.costBasis);
  }

  const sectorRows: SectorRow[] = [...sectorCosts.entries()]
    .map(([sector, cost]) => {
      const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
      let status: AllocStatus = "OK";
      if (pct > cfg.maxPerSector) status = "OVER";
      else if (pct > cfg.maxPerSector - cfg.nearLimitBuf) status = "NEAR_LIMIT";

      const targetKey = displaySectorToTargetKey(sector);
      const target =
        targetKey && sectorTargets[targetKey] != null
          ? sectorTargets[targetKey]
          : null;
      let drift: number | null = null;
      let targetStatus: SectorRow["targetStatus"] = "NO_TARGET";
      if (target != null) {
        drift = pct - target;
        if (Math.abs(drift) <= cfg.nearLimitBuf) targetStatus = "IN_BAND";
        else if (drift > 0) targetStatus = "OVER_TARGET";
        else targetStatus = "UNDER_TARGET";
      }
      return { sector, pct, status, target, drift, targetStatus };
    })
    .sort((a, b) => b.pct - a.pct);

  const coreCost = holdings
    .filter((h) => classifyBucket(h.sector, h.symbol) === "Core")
    .reduce((s, h) => s + h.costBasis, 0);
  const satelliteCost = totalCost - coreCost;
  const coreActual = totalCost > 0 ? (coreCost / totalCost) * 100 : 0;
  const satelliteActual = totalCost > 0 ? (satelliteCost / totalCost) * 100 : 0;

  const trimCandidates = holdingMappings.filter(
    (m) => m.primaryAction === "TRIM" || m.allocStatus === "OVER",
  );
  const stopLossCandidates = holdingMappings.filter(
    (m) => m.exitTrigger === "STOP_LOSS",
  );
  const takeProfitCandidates = holdingMappings.filter(
    (m) => m.exitTrigger === "TAKE_PROFIT" || m.exitTrigger === "TARGET_REACHED",
  );
  const sectorViolations = sectorRows.filter((s) => s.status === "OVER");
  const urgentActionCount =
    trimCandidates.length +
    stopLossCandidates.length +
    takeProfitCandidates.length +
    sectorViolations.length;

  return {
    totalCost,
    totalValue,
    totalPL,
    totalPLPct,
    maxPerStock: cfg.maxPerStock,
    maxPerSector: cfg.maxPerSector,
    takeProfitThreshold: cfg.takeProfitPct,
    stopLossThreshold: cfg.stopLossPct,
    holdingMappings,
    sectorRows,
    coreVsSatellite: {
      coreActual,
      coreTarget: cfg.coreTarget,
      satelliteActual,
      satelliteTarget: cfg.satelliteTarget,
      coreDrift: coreActual - cfg.coreTarget,
      satelliteDrift: satelliteActual - cfg.satelliteTarget,
    },
    trimCandidates,
    stopLossCandidates,
    takeProfitCandidates,
    sectorViolations,
    urgentActionCount,
    overallCompliant: urgentActionCount === 0,
    targetReturn: cfg.targetReturn,
    goldenRules: cfg.goldenRules,
  };
}

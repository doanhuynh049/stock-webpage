import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StrategyConfig, UserStrategyOverrides } from "@/lib/strategy/strategy-types";

export type { StrategyConfig, UserStrategyOverrides } from "@/lib/strategy/strategy-types";
export { SECTOR_TARGET_LABELS } from "@/lib/strategy/strategy-types";

function parsePercent(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseFloat(value.replace("%", "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseCoreAllocation(raw: string | undefined): number {
  if (!raw) return 60;
  return parsePercent(raw, 60);
}

export function loadDefaultStrategyConfig(): StrategyConfig {
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "data", "investment-strategy.json"), "utf-8"),
    ) as {
      investment_framework?: {
        strategy_and_rules?: {
          objectives?: { target_return?: string };
          golden_rules?: string[];
          portfolio_structure?: {
            core?: { allocation?: string };
          };
          rules?: {
            exit?: { take_profit?: string; cut_loss?: string };
            risk_management?: {
              position_sizing?: { max_per_stock?: string; max_per_sector?: string };
            };
          };
          sector_targets?: Record<string, number>;
        };
      };
    };
    const rules = raw.investment_framework?.strategy_and_rules;
    const sizing = rules?.rules?.risk_management?.position_sizing;
    const exit = rules?.rules?.exit;
    const coreTarget = parseCoreAllocation(rules?.portfolio_structure?.core?.allocation);

    const sectorTargets: Record<string, number> = {};
    for (const [k, v] of Object.entries(rules?.sector_targets ?? {})) {
      if (!k.startsWith("_") && typeof v === "number") sectorTargets[k] = v;
    }

    let takeProfit = 25;
    const tp = exit?.take_profit ?? "";
    const tpMatch = tp.match(/\+?(\d+)/);
    if (tpMatch) takeProfit = parseInt(tpMatch[1], 10);

    let stopLoss = -10;
    const sl = exit?.cut_loss ?? "";
    const slMatch = sl.match(/-(\d+)/);
    if (slMatch) stopLoss = -parseInt(slMatch[1], 10);

    return {
      maxPerStock: parsePercent(sizing?.max_per_stock, 15),
      maxPerSector: parsePercent(sizing?.max_per_sector, 35),
      takeProfitPct: takeProfit,
      stopLossPct: stopLoss,
      nearLimitBuf: 2,
      coreTarget,
      satelliteTarget: 100 - coreTarget,
      sectorTargets,
      targetReturn:
        rules?.objectives?.target_return ?? "15–25% over 1–3 years",
      goldenRules: rules?.golden_rules ?? [],
    };
  } catch {
    return {
      maxPerStock: 15,
      maxPerSector: 35,
      takeProfitPct: 25,
      stopLossPct: -10,
      nearLimitBuf: 2,
      coreTarget: 60,
      satelliteTarget: 40,
      sectorTargets: {
        BANKING_FINANCE: 25,
        REAL_ESTATE_CONSTRUCTION: 12,
        CONSUMER_RETAIL: 15,
        MANUFACTURING_INDUSTRIALS: 10,
        ENERGY: 8,
        MATERIALS: 5,
        TECH_TELECOM: 20,
        TRANSPORT_LOGISTICS: 3,
        HEALTHCARE_PHARMA: 2,
      },
      targetReturn: "15–25% over 1–3 years",
      goldenRules: [],
    };
  }
}

export function mergeStrategyConfig(
  overrides?: UserStrategyOverrides | null,
): StrategyConfig {
  const base = loadDefaultStrategyConfig();
  if (!overrides) return base;

  const coreTarget = overrides.coreTarget ?? base.coreTarget;
  return {
    ...base,
    ...overrides,
    coreTarget,
    satelliteTarget: overrides.satelliteTarget ?? 100 - coreTarget,
    sectorTargets: { ...base.sectorTargets, ...overrides.sectorTargets },
    goldenRules: overrides.goldenRules ?? base.goldenRules,
  };
}

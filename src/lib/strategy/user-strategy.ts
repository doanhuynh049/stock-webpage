import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canUseLocalDataFiles } from "@/lib/serverless";
import { loadDefaultStrategyConfig, mergeStrategyConfig } from "@/lib/strategy/strategy-config";
import type { StrategyConfig, UserStrategyOverrides } from "@/lib/strategy/strategy-types";

const STRATEGY_DIR = join(process.cwd(), "data", "user-strategy");

function filePath(userId: string): string {
  return join(STRATEGY_DIR, `${userId}.json`);
}

function readFileOverrides(userId: string): UserStrategyOverrides | null {
  if (!canUseLocalDataFiles()) return null;
  const path = filePath(userId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as UserStrategyOverrides;
    return Object.keys(raw).length ? raw : null;
  } catch {
    return null;
  }
}

function writeFileOverrides(userId: string, overrides: UserStrategyOverrides) {
  if (!canUseLocalDataFiles()) return;
  mkdirSync(STRATEGY_DIR, { recursive: true });
  writeFileSync(filePath(userId), JSON.stringify(overrides, null, 2));
}

export async function getUserStrategyConfig(userId: string): Promise<StrategyConfig> {
  return mergeStrategyConfig(readFileOverrides(userId));
}

export async function saveUserStrategyConfig(
  userId: string,
  overrides: UserStrategyOverrides,
): Promise<StrategyConfig> {
  writeFileOverrides(userId, overrides);
  return mergeStrategyConfig(overrides);
}

export async function resetUserStrategyConfig(userId: string): Promise<StrategyConfig> {
  if (canUseLocalDataFiles()) {
    const path = filePath(userId);
    if (existsSync(path)) unlinkSync(path);
  }
  return loadDefaultStrategyConfig();
}

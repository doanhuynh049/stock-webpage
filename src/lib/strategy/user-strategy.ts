import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canUseLocalDataFiles } from "@/lib/serverless";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { loadDefaultStrategyConfig, mergeStrategyConfig } from "@/lib/strategy/strategy-config";
import type { StrategyConfig, UserStrategyOverrides } from "@/lib/strategy/strategy-types";

const STRATEGY_DIR = join(process.cwd(), "data", "user-strategy");
const STRATEGY_CACHE_TYPE = "user_strategy";
const STRATEGY_MODEL = "v1";

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

async function readDbOverrides(userId: string): Promise<UserStrategyOverrides | null> {
  if (!isPersistenceEnabled()) return null;
  try {
    const row = await withDbRetry(
      () =>
        prisma.aiResponseCache.findUnique({
          where: {
            symbol_analysisType_modelName: {
              symbol: userId,
              analysisType: STRATEGY_CACHE_TYPE,
              modelName: STRATEGY_MODEL,
            },
          },
        }),
      "strategy-load",
      0,
    );
    if (!row?.payload || typeof row.payload !== "object") return null;
    return row.payload as UserStrategyOverrides;
  } catch {
    return null;
  }
}

async function writeDbOverrides(
  userId: string,
  overrides: UserStrategyOverrides,
): Promise<void> {
  if (!isPersistenceEnabled()) return;
  try {
    await withDbRetry(
      () =>
        prisma.aiResponseCache.upsert({
          where: {
            symbol_analysisType_modelName: {
              symbol: userId,
              analysisType: STRATEGY_CACHE_TYPE,
              modelName: STRATEGY_MODEL,
            },
          },
          create: {
            symbol: userId,
            analysisType: STRATEGY_CACHE_TYPE,
            modelName: STRATEGY_MODEL,
            cachedAt: new Date(),
            ttlHours: 8760,
            payload: overrides,
          },
          update: {
            cachedAt: new Date(),
            payload: overrides,
          },
        }),
      "strategy-save",
      0,
    );
  } catch (err) {
    console.warn("[strategy] DB save failed:", (err as Error).message);
  }
}

/** Per-user strategy overrides merged with `data/investment-strategy.json` defaults. */
export async function getUserStrategyConfig(userId: string): Promise<StrategyConfig> {
  const overrides =
    readFileOverrides(userId) ?? (await readDbOverrides(userId));
  return mergeStrategyConfig(overrides);
}

export async function saveUserStrategyConfig(
  userId: string,
  overrides: UserStrategyOverrides,
): Promise<StrategyConfig> {
  writeFileOverrides(userId, overrides);
  await writeDbOverrides(userId, overrides);
  return mergeStrategyConfig(overrides);
}

export async function resetUserStrategyConfig(userId: string): Promise<StrategyConfig> {
  if (canUseLocalDataFiles()) {
    const path = filePath(userId);
    if (existsSync(path)) unlinkSync(path);
  }
  await prisma.aiResponseCache
    .deleteMany({
      where: {
        symbol: userId,
        analysisType: STRATEGY_CACHE_TYPE,
        modelName: STRATEGY_MODEL,
      },
    })
    .catch(() => null);
  return loadDefaultStrategyConfig();
}

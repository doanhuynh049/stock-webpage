import { z } from "zod";

// ─── trading ──────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const tradeInputSchema = z.object({
  transactionDate: isoDate,
  itemName: z.string().trim().min(1).max(20),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().positive(),
  transactionType: z.enum(["BUY", "SELL"]),
  fee: z.number().finite().nonnegative().optional(),
  tax: z.number().finite().nonnegative().optional(),
  profit: z.number().finite().nullable().optional(),
  exchange: z.string().max(20).nullable().optional(),
  sector: z.string().max(64).nullable().optional(),
});

// ─── portfolio ────────────────────────────────────────────────────────────

export const portfolioHoldingInputSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  name: z.string().max(200).nullable().optional(),
  exchange: z.string().max(20).nullable().optional(),
  sector: z.string().max(64).nullable().optional(),
  industry: z.string().max(64).nullable().optional(),
  shares: z.number().finite().nonnegative(),
  avgBuyPrice: z.number().finite().nonnegative().nullable().optional(),
  target3Month: z.number().finite().nullable().optional(),
  targetLongTerm: z.number().finite().nullable().optional(),
  targetSetDate: z.string().nullable().optional(),
  platform: z.string().max(64).nullable().optional(),
});

export const portfolioHoldingsBodySchema = z.array(portfolioHoldingInputSchema).max(500);

// ─── settings/ai ──────────────────────────────────────────────────────────

const llmProviderSchema = z.enum([
  "cerebras", "groq", "gemini", "mistral", "openrouter",
  "sambanova", "cohere", "huggingface", "cloudflare", "ollama", "llm7",
  "fallback",
]);

export const providerConfigSchema = z.object({
  id: llmProviderSchema,
  enabled: z.boolean(),
  model: z.string().max(200),
  priority: z.number().int().min(0).max(100),
  apiKey: z.string().max(500).optional(),
});

export const aiSettingsSchema = z.object({
  providers: z.array(providerConfigSchema).max(20),
  updatedAt: z.string().optional(),
});

export const testProviderRequestSchema = z.object({
  id: z.string().max(50),
  model: z.string().max(200).optional(),
  apiKey: z.string().max(500).optional(),
});

export const autoSelectRequestSchema = z.object({
  providers: z
    .array(
      z.object({
        id: z.string().max(50),
        apiKey: z.string().max(500).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .max(20)
    .default([]),
});

// ─── strategy ─────────────────────────────────────────────────────────────

export const userStrategyOverridesSchema = z.object({
  maxPerStock: z.number().finite().min(0).max(100).optional(),
  maxPerSector: z.number().finite().min(0).max(100).optional(),
  takeProfitPct: z.number().finite().optional(),
  stopLossPct: z.number().finite().optional(),
  nearLimitBuf: z.number().finite().min(0).max(100).optional(),
  coreTarget: z.number().finite().min(0).max(100).optional(),
  satelliteTarget: z.number().finite().min(0).max(100).optional(),
  sectorTargets: z.record(z.string(), z.number().finite().min(0).max(100)).optional(),
  targetReturn: z.string().max(20).optional(),
  goldenRules: z.array(z.string().max(500)).max(50).optional(),
});

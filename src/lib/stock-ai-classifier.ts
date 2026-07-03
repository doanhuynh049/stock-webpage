/**
 * Classifier for Vietnamese stocks not found in curated JSON files.
 *
 * Resolution order:
 *   1. stock_symbol DB cache (instant — populated by prior runs)
 *   2. TCBS company overview API (authoritative real data — no LLM hallucination)
 *   3. LLM classification (fallback when TCBS doesn't know the ticker)
 *
 * Results are always persisted to the DB so future requests skip steps 2 & 3.
 */

import { callLlm } from "@/lib/providers/llm";
import { getTcbsStockMeta } from "@/lib/providers/tcbs";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";

export interface AiStockMeta {
  name: string;
  sector: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  profile: string;
}

const SECTOR_LIST = [
  "Banking",
  "Technology",
  "Real Estate",
  "Consumer Goods",
  "Industrial",
  "Energy",
  "Healthcare",
  "Financial Services",
  "Infrastructure",
  "Securities",
  "Insurance",
  "Retail",
  "Construction",
  "Agriculture",
  "Transportation",
  "Materials",
  "Utilities",
  "Telecommunications",
].join(", ");

async function getFromDB(symbol: string): Promise<AiStockMeta | null> {
  if (!isPersistenceEnabled()) return null;
  try {
    const row = await prisma.stockSymbol.findUnique({
      where: { symbol: symbol.toUpperCase() },
      select: { name: true, sector: true, exchange: true },
    });
    if (row?.sector && row.sector !== "Unknown" && row.name && row.name !== symbol) {
      return {
        name: row.name,
        sector: row.sector,
        exchange: (row.exchange ?? "HOSE") as AiStockMeta["exchange"],
        profile: `${row.name} (${symbol}) is a Vietnamese listed company in the ${row.sector} sector.`,
      };
    }
  } catch {
    // DB unavailable — fall through to LLM
  }
  return null;
}

async function saveToDB(symbol: string, meta: AiStockMeta): Promise<void> {
  if (!isPersistenceEnabled()) return;
  try {
    await prisma.stockSymbol.upsert({
      where: { symbol: symbol.toUpperCase() },
      update: { name: meta.name, sector: meta.sector, exchange: meta.exchange, updatedAt: new Date() },
      create: { symbol: symbol.toUpperCase(), name: meta.name, sector: meta.sector, exchange: meta.exchange },
    });
  } catch {
    // DB write failure is non-fatal
  }
}

/**
 * Resolves sector, name, and profile for an unknown stock.
 *
 * Resolution order:
 *   1. DB cache (instant)
 *   2. TCBS company overview API (authoritative — no hallucination)
 *   3. LLM classification (last resort)
 *
 * @param symbol  - Stock ticker (e.g. "HHV")
 * @param hint    - Optional company name hint from the quote provider
 */
export async function classifyUnknownStock(
  symbol: string,
  hint?: string,
): Promise<AiStockMeta | null> {
  // 1. DB cache
  const cached = await getFromDB(symbol);
  if (cached) return cached;

  // 2. TCBS real company data (authoritative — avoids LLM hallucination)
  const tcbs = await getTcbsStockMeta(symbol);
  if (tcbs) {
    const meta: AiStockMeta = {
      name: tcbs.name,
      sector: tcbs.sector,
      exchange: tcbs.exchange,
      profile: tcbs.profile,
    };
    await saveToDB(symbol, meta);
    return meta;
  }

  // 3. LLM fallback (TCBS doesn't know this ticker)
  const namePart =
    hint && hint !== symbol ? ` The company may be named "${hint}".` : "";
  const prompt =
    `Vietnamese stock exchange ticker: ${symbol}.${namePart}\n\n` +
    `Identify this company and respond ONLY with valid JSON (no markdown fences):\n` +
    `{"name":"Full English Company Name","sector":"Sector","exchange":"HOSE","profile":"One sentence description"}\n\n` +
    `Valid sectors: ${SECTOR_LIST}\n` +
    `Exchange must be one of: HOSE, HNX, UPCOM. Default to HOSE if unsure.`;

  try {
    const result = await callLlm(
      [
        {
          role: "system",
          content:
            "You are a Vietnamese stock market expert. You know all companies listed on HOSE, HNX, and UPCOM. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      "",
      { maxTokens: 200, skipDefaultSystem: true },
    );

    if (!result.content || result.provider === "fallback") return null;

    const clean = result.content.replace(/```json?|```/g, "").trim();
    const parsed = JSON.parse(clean) as Partial<AiStockMeta>;
    if (!parsed.name || !parsed.sector) return null;

    const validExchanges = new Set(["HOSE", "HNX", "UPCOM"]);
    const meta: AiStockMeta = {
      name: parsed.name,
      sector: parsed.sector,
      exchange: validExchanges.has(parsed.exchange ?? "")
        ? (parsed.exchange as AiStockMeta["exchange"])
        : "HOSE",
      profile:
        parsed.profile ??
        `${parsed.name} (${symbol}) operates in the ${parsed.sector} sector.`,
    };

    await saveToDB(symbol, meta);
    return meta;
  } catch {
    return null;
  }
}

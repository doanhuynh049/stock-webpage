import type { AiNewsItem, NewsSummaryResponse, StockMover } from "@/app/api/news/summary/route";

export const SHORT_TERM_SIGNALS = new Set(["earnings", "filing", "analyst", "insider"]);
export const LONG_TERM_SIGNALS = new Set(["macro", "guidance", "ma"]);

export type PickItem = {
  symbol: string;
  name?: string;
  reason: string;
  impact: "HIGH" | "MEDIUM";
  horizon: "short" | "long";
  signalType?: string;
  newsTitle?: string;
  newsLink?: string;
};

function classifyHorizon(
  mover: StockMover,
  relatedNews: AiNewsItem[],
): "short" | "long" {
  const news = relatedNews.find(
    (n) =>
      n.affectedSymbols.includes(mover.symbol) ||
      n.cascadeSymbols.includes(mover.symbol),
  );
  if (!news) return "short";
  if (LONG_TERM_SIGNALS.has(news.signalType)) return "long";
  if (SHORT_TERM_SIGNALS.has(news.signalType)) return "short";
  return "short";
}

export function buildPicks(data: NewsSummaryResponse): {
  short: PickItem[];
  long: PickItem[];
} {
  const picks: PickItem[] = [];
  const seenSymbols = new Set<string>();

  function addPick(p: PickItem) {
    if (seenSymbols.has(p.symbol)) return;
    seenSymbols.add(p.symbol);
    picks.push(p);
  }

  for (const m of data.stockMovers.filter((m) => m.direction === "UP")) {
    const horizon = classifyHorizon(m, data.allItems);
    const related = data.allItems.find(
      (n) =>
        n.affectedSymbols.includes(m.symbol) ||
        n.cascadeSymbols.includes(m.symbol),
    );
    addPick({
      symbol: m.symbol,
      name: m.name,
      reason: m.reason,
      impact: m.impact,
      horizon,
      signalType: related?.signalType,
      newsTitle: related?.title,
      newsLink: related?.link,
    });
  }

  for (const trend of data.sectorTrends.filter((t) => t.direction === "UP")) {
    for (const sym of trend.keySymbols.slice(0, 3)) {
      addPick({
        symbol: sym,
        reason: trend.reason,
        impact: trend.confidence === "HIGH" ? "HIGH" : "MEDIUM",
        horizon: "long",
        signalType: "macro",
        newsTitle: `${trend.sector} sector trend`,
      });
    }
  }

  const itemsToScan = [
    ...data.hotItems,
    ...data.allItems.filter((n) => n.sentiment === "Bullish" && n.impact !== "LOW"),
  ];
  for (const item of itemsToScan) {
    if (item.sentiment !== "Bullish") continue;
    const syms = [...item.affectedSymbols, ...item.cascadeSymbols].slice(0, 4);
    if (!syms.length) continue;
    const horizon: "short" | "long" = LONG_TERM_SIGNALS.has(item.signalType)
      ? "long"
      : "short";
    for (const sym of syms) {
      addPick({
        symbol: sym,
        reason:
          item.aiSummary && item.aiSummary !== item.title
            ? item.aiSummary
            : item.title,
        impact: item.impact === "HIGH" ? "HIGH" : "MEDIUM",
        horizon,
        signalType: item.signalType,
        newsTitle: item.title,
        newsLink: item.link,
      });
    }
  }

  return {
    short: picks.filter((p) => p.horizon === "short").slice(0, 8),
    long: picks.filter((p) => p.horizon === "long").slice(0, 8),
  };
}

export type MarketIndex = {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
};

export type SectorPerformance = {
  sector: string;
  changePercent: number;
  marketCapWeight?: number;
};

export type MarketStats = {
  totalVolume: number;
  totalValue: number;
  foreignNetBuy: number;
  advancing: number;
  declining: number;
  unchanged: number;
};

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  rsi: number;
  dividendYield: number;
  high52w: number;
  low52w: number;
  profile: string;
  financials: Financials;
  analystRating: "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";
  analystTarget: number;
};

export type Financials = {
  revenue: number[];
  netProfit: number[];
  totalDebt: number[];
  years: string[];
};

export type PricePoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  symbols: string[];
  category: "breaking" | "earnings" | "macro" | "analysis";
  /** External article URL when fetched from live RSS. */
  link?: string;
};

export type TechnicalSignal = {
  indicator: string;
  value: number;
  signal: "Oversold" | "Overbought" | "Neutral" | "Bullish" | "Bearish";
};

export type MarketSnapshot = {
  lastUpdated: string;
  session: "morning" | "afternoon";
  sentiment: "Bullish" | "Neutral" | "Bearish";
  sentimentScore: number;
  indices: MarketIndex[];
  sectors: SectorPerformance[];
  stats: MarketStats;
};

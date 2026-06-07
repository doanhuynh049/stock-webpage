export type TradeType = "BUY" | "SELL";

export type TradeRecord = {
  id: string;
  userId: string;
  transactionDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  fee: number;
  tax: number;
  profit: number | null;
  transactionType: TradeType;
  exchange: string | null;
  sector: string | null;
};

export type TradeInput = {
  transactionDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  transactionType: TradeType;
  fee?: number;
  tax?: number;
  profit?: number | null;
  exchange?: string | null;
  sector?: string | null;
};

export type TradeSummary = {
  total: number;
  buys: number;
  sells: number;
  totalProfit: number;
  winRate: number | null;
  firstDate: string | null;
  lastDate: string | null;
};

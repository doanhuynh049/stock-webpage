/** Normalize prices that may be stored in thousands (25.25) to full VND (25250). */
export function toVndPrice(value: number, referenceVnd?: number): number {
  if (value <= 0) return value;
  if (value >= 500) return Math.round(value);
  if (referenceVnd && referenceVnd >= 500 && value < referenceVnd / 50) {
    return Math.round(value * 1000);
  }
  return Math.round(value * 1000);
}

export function analystTargetVnd(stock: {
  price: number;
  analystTarget: number;
}): number {
  if (stock.analystTarget <= 0) return 0;
  return toVndPrice(stock.analystTarget, stock.price);
}

/** Upside from current price to analyst target (percent). */
export function analystTargetUpsidePercent(stock: {
  price: number;
  analystTarget: number;
}): number {
  const price = stock.price;
  const target = analystTargetVnd(stock);
  if (price <= 0 || target <= 0) return 0;
  return ((target - price) / price) * 100;
}

/**
 * Vietnamese ETF symbol detection.
 *
 * ETFs track indices and have no individual company fundamentals
 * (ROE, P/E, P/B, revenue growth are not meaningful).
 *
 * Naming conventions on HOSE / HNX:
 *  - "FUE…"   — all Exchange-Traded Products under the FUE code block
 *               (e.g. FUEVFVND, FUESSVFL, FUEDCMID, FUEKIV30, FUEMAV30,
 *                    FUESSV50, FUEVN100, FUESSV30, FUEVN30)
 *  - "E1VF…"  — older SSIAM series (e.g. E1VFVN30)
 */
export function isEtfSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase().trim();
  return s.startsWith("FUE") || s.startsWith("E1VF");
}

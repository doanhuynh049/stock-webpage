/** Core investing principles — reference copy for UI (English). Source: user guidelines. */

export type InvestmentPrinciple = {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
};

export const INVESTMENT_PRINCIPLES: InvestmentPrinciple[] = [
  {
    id: "understand",
    title: "1. Only invest in what you understand",
    summary:
      "Do not buy a stock just because someone else recommended it.",
    bullets: [
      "Understand how the business makes money and where the industry is heading.",
      "If you cannot explain in simple terms why you are buying, you may not understand it well enough.",
    ],
  },
  {
    id: "living-money",
    title: "2. Do not use money you need to live on",
    summary: "Only invest capital you can leave in the market for years.",
    bullets: [
      "Build an emergency fund first (typically 3–6 months of living expenses).",
      "Never invest rent, loan repayment, or short-term cash needs.",
    ],
  },
  {
    id: "diversify",
    title: "3. Diversify your portfolio",
    summary: "Do not put all your capital into a single stock.",
    bullets: [
      "Spread holdings across sectors and names (Core–Satellite targets in Strategy Review help here).",
      "Diversification limits damage when one company or sector hits trouble.",
    ],
  },
  {
    id: "long-term",
    title: "4. Invest for the long term",
    summary: "Short-term markets are volatile; lasting returns often come from holding quality businesses.",
    bullets: [
      "Avoid constant trading driven by emotion or daily headlines.",
      "Use Analysis and Strategy Review for decisions, not intraday noise alone.",
    ],
  },
  {
    id: "quality-price",
    title: "5. Buy good businesses at fair prices",
    summary: "Look beyond the ticker symbol.",
    bullets: [
      "Revenue and profit growth trends",
      "Debt levels (not too high)",
      "Competitive advantage (moat)",
      "Management credibility and governance",
    ],
  },
  {
    id: "risk",
    title: "6. Manage risk",
    summary: "Preserve capital before chasing returns.",
    bullets: [
      "Do not go all-in on one symbol (see max-per-stock limits in Strategy).",
      "Avoid margin/leverage until you have experience.",
      "Plan for sharp market drawdowns — they will happen.",
    ],
  },
  {
    id: "emotion",
    title: "7. Control your emotions",
    summary: "The two most dangerous emotions for investors:",
    bullets: [
      "Greed — chasing rallies after a big run-up.",
      "Fear — panic selling in a correction.",
      "Many losses come from emotion, not from poor analysis alone.",
    ],
  },
  {
    id: "dca",
    title: "8. Invest consistently (DCA)",
    summary: "Instead of trying to time exact tops and bottoms:",
    bullets: [
      "Invest on a regular schedule (monthly or quarterly).",
      "Dollar-Cost Averaging (DCA) smooths out short-term volatility.",
      "Trading ledger + portfolio sync support tracking regular buys.",
    ],
  },
  {
    id: "plan",
    title: "9. Have a plan before you buy",
    summary: "Answer these before every purchase:",
    bullets: [
      "Why am I buying?",
      "When will I sell (take-profit / stop-loss)?",
      "What would prove my original thesis wrong?",
      "Strategy Review action items (STOP_LOSS, TRIM, TAKE_PROFIT) encode this.",
    ],
  },
  {
    id: "learn",
    title: "10. Never stop learning",
    summary: "Build knowledge over time in:",
    bullets: [
      "Fundamental analysis (Analysis → Fundamental tab)",
      "Financial statements and sector context",
      "Portfolio management (Portfolio + Strategy Review)",
      "Market psychology",
    ],
  },
];

export const INVESTMENT_MOTTO = {
  quote: "Don't lose money. If you're not sure, don't invest.",
  attribution: "Simple rule many successful investors follow (Warren Buffett spirit)",
} as const;

/** Where these principles appear in the app */
export const PRINCIPLES_IN_APP = [
  "Analysis → Principles tab (this panel)",
  "Strategy Review → golden rules from investment-strategy.json",
  "AI Analyst → can answer questions with these guidelines in context",
] as const;

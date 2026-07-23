import {
  ArrowLeftRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Filter,
  LayoutDashboard,
  Newspaper,
  Star,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, desc: "Market overview" },
  { href: "/news", label: "News", icon: Newspaper, desc: "AI digest & earnings" },
  { href: "/screener", label: "Screener", icon: Filter, desc: "Find stocks" },
  { href: "/portfolio", label: "Portfolio", icon: Wallet, desc: "Your holdings" },
  { href: "/strategy-review", label: "Strategy", icon: Target, desc: "Compliance review" },
  { href: "/trading", label: "Trading", icon: ArrowLeftRight, desc: "BUY/SELL ledger" },
  { href: "/analysis", label: "Analysis", icon: BarChart3, desc: "Scores & picks" },
  { href: "/watchlist", label: "Watchlist", icon: Star, desc: "Favorites" },
  { href: "/analyst", label: "Analyst AI", icon: BrainCircuit, desc: "Multi-agent report" },
  { href: "/ai-analyst", label: "AI Analyst", icon: Bot, desc: "Ask anything" },
];

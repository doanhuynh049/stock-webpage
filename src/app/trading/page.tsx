import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TradingLedger } from "@/components/trading/trading-ledger";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TradingPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="Trading Records"
        description="Sign in to log BUY/SELL trades. Portfolio rebuilds automatically and syncs to Neon."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trading Records"
        description="Personal trade ledger — each save syncs to Neon and rebuilds portfolio_holding (like stock-service)"
        badge={
          <Link
            href="/portfolio"
            className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)] hover:text-accent"
          >
            View portfolio →
          </Link>
        }
      />

      <Card className="!p-4">
        <CardTitle className="!mb-3 !text-base">Trade ledger</CardTitle>
        <TradingLedger />
      </Card>
    </div>
  );
}

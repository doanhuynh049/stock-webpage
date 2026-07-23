import { BrainCircuit, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AnalystReport } from "@/components/analyst/analyst-report";
import { auth } from "@/lib/auth";

export default async function AnalystPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const { symbol } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="AI Investment Analyst"
        description="A professional multi-agent analyst for Vietnamese equities — Company, Valuation, Technical, News, Risk, and Macro agents combine into a single rated investment report."
        actionLabel="Sign in to analyze"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Investment Analyst"
        description="Six specialist agents → decision engine → rated investment report"
        badge={
          <Badge variant="success" className="px-3 py-1">
            <Sparkles className="mr-1 inline h-3 w-3" />
            Multi-agent
          </Badge>
        }
      />
      <AnalystReport initialSymbol={symbol?.toUpperCase()} />
    </div>
  );
}

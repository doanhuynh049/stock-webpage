import { Bot, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { AiAnalystChat } from "@/components/ai-analyst/chat";
import { auth } from "@/lib/auth";

export default async function AiAnalystPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const { symbol } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    return (
      <EmptyState
        icon={Bot}
        title="AI Analyst"
        description="ChatGPT-style investing assistant for Vietnamese equities. Ask about buy decisions, compare tickers, or explore market trends."
        actionLabel="Sign in to chat"
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      <PageHeader
        title="AI Analyst"
        description="Intelligent stock analysis powered by Vietnam market data"
        badge={
          <Badge variant="success" className="px-3 py-1">
            <Sparkles className="mr-1 inline h-3 w-3" />
            Online
          </Badge>
        }
      />

      <Card glow className="flex min-h-0 flex-1 flex-col !p-0">
        <AiAnalystChat initialSymbol={symbol?.toUpperCase()} />
      </Card>
    </div>
  );
}

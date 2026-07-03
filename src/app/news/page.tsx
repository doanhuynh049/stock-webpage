import { PageHeader } from "@/components/ui/page-header";
import { AiNewsSummary } from "@/components/stock/ai-news-summary";
import { EarningsCalendar } from "@/components/news/earnings-calendar";
import { HotPicksPanel } from "@/components/news/hot-picks-panel";

export const dynamic = "force-dynamic";

export default function NewsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="News & Earnings"
        description="Real-time AI market intelligence · hot picks · 7-signal framework · VN earnings calendar"
      />

      {/* Hot picks banner — full width */}
      <HotPicksPanel />

      {/* Main 2-column grid: news digest left, earnings calendar right */}
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <AiNewsSummary />
        </div>
        <div className="xl:col-span-2">
          <EarningsCalendar />
        </div>
      </div>
    </div>
  );
}

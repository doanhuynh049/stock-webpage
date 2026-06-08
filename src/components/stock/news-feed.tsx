import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import type { NewsItem } from "@/types/stock";
import { Newspaper } from "lucide-react";

const categoryVariant: Record<NewsItem["category"], "danger" | "success" | "info" | "warning"> = {
  breaking: "danger",
  earnings: "success",
  macro: "info",
  analysis: "warning",
};

export function NewsFeed({ items }: { items: NewsItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="group surface-muted rounded-xl p-4 transition-all hover:border-[var(--border-strong)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-[var(--bg-secondary)] p-2 ring-1 ring-[var(--border)]">
              <Newspaper className="h-3.5 w-3.5 text-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium leading-snug text-[var(--fg)] group-hover:text-accent">
                {item.link ? (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </h4>
              {item.summary && item.summary !== item.title && (
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {item.summary}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={categoryVariant[item.category]}>
                  {item.category}
                </Badge>
                <span className="text-[10px] text-subtle">
                  {item.source} ·{" "}
                  {formatDistanceToNow(new Date(item.publishedAt), {
                    addSuffix: true,
                  })}
                </span>
                {item.symbols.map((sym) => (
                  <Link key={sym} href={`/stocks/${sym}`}>
                    <Badge variant="success">{sym}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

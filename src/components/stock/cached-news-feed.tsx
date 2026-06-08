"use client";

import { useCallback } from "react";
import { NewsFeed } from "@/components/stock/news-feed";
import {
  LOCAL_CACHE_KEYS,
  LOCAL_CACHE_TTL,
} from "@/lib/client/local-storage-cache";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import type { NewsItem } from "@/types/stock";

function parseNewsResponse(json: unknown): NewsItem[] | null {
  const news = (json as { news?: NewsItem[] })?.news;
  return Array.isArray(news) && news.length ? news : null;
}

export function CachedNewsFeed({
  symbol,
  limit = 5,
}: {
  symbol?: string;
  limit?: number;
}) {
  const sym = symbol?.toUpperCase();
  const cacheKey = sym
    ? LOCAL_CACHE_KEYS.newsSymbol(sym)
    : LOCAL_CACHE_KEYS.newsMarket;
  const url = sym ? `/api/news?symbol=${encodeURIComponent(sym)}` : "/api/news";

  const select = useCallback(
    (json: unknown) => parseNewsResponse(json),
    [],
  );

  const { data, loading, error } = useCachedFetch<NewsItem[]>(
    cacheKey,
    url,
    LOCAL_CACHE_TTL.news,
    select,
  );

  if (loading && !data?.length) {
    return <p className="text-sm text-muted">Loading news…</p>;
  }

  if (error && !data?.length) {
    return <p className="text-sm text-muted">Could not load news.</p>;
  }

  const items = (data ?? []).slice(0, limit);
  if (!items.length) {
    return (
      <p className="text-sm text-muted">
        {sym ? `No recent news for ${sym}.` : "No market news available."}
      </p>
    );
  }

  return <NewsFeed items={items} />;
}

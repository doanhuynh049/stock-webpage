"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readLocalCache,
  writeLocalCache,
} from "@/lib/client/local-storage-cache";

type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: boolean;
};

/**
 * Fetch JSON from an API route with localStorage TTL cache.
 * Shows cached data immediately, then revalidates in the background.
 */
export function useCachedFetch<T>(
  cacheKey: string,
  url: string,
  ttlMs: number,
  select: (json: unknown) => T | null,
): FetchState<T> & { refresh: () => void } {
  const [state, setState] = useState<FetchState<T>>(() => ({
    data: readLocalCache<T>(cacheKey, ttlMs),
    loading: !readLocalCache<T>(cacheKey, ttlMs),
    error: false,
  }));

  const load = useCallback(
    (background: boolean) => {
      if (!background) {
        setState((s) => ({ ...s, loading: true, error: false }));
      }
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json) => {
          const next = select(json);
          if (next == null) throw new Error("empty payload");
          writeLocalCache(cacheKey, next);
          setState({ data: next, loading: false, error: false });
        })
        .catch(() => {
          setState((s) => ({
            data: s.data ?? readLocalCache<T>(cacheKey, ttlMs),
            loading: false,
            error: !s.data && !readLocalCache<T>(cacheKey, ttlMs),
          }));
        });
    },
    [cacheKey, url, ttlMs, select],
  );

  useEffect(() => {
    const cached = readLocalCache<T>(cacheKey, ttlMs);
    if (cached) {
      setState({ data: cached, loading: false, error: false });
      load(true);
    } else {
      load(false);
    }
  }, [cacheKey, url, ttlMs, load]);

  return {
    ...state,
    refresh: () => load(false),
  };
}

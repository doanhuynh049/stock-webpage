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

const INITIAL: FetchState<never> = {
  data: null,
  loading: true,
  error: false,
};

/**
 * Fetch JSON from an API route with localStorage TTL cache.
 * SSR and the first client paint match (loading); cache is read only after mount.
 */
export function useCachedFetch<T>(
  cacheKey: string,
  url: string,
  ttlMs: number,
  select: (json: unknown) => T | null,
): FetchState<T> & { refresh: () => void } {
  const [state, setState] = useState<FetchState<T>>(INITIAL as FetchState<T>);

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
    // localStorage is client-only — SSR always renders the `loading: true`
    // INITIAL state, so this cache hydrate must stay in an effect (runs
    // post-hydration) rather than a lazy useState init, to avoid a mismatch.
    const cached = readLocalCache<T>(cacheKey, ttlMs);
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration cache hydrate, see comment above
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

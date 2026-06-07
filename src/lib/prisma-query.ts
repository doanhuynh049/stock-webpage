const RETRYABLE = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "P1001", "P1008"]);

function hasTimeoutInAggregate(err: unknown): boolean {
  const agg = err as { code?: string; errors?: Array<{ code?: string }> };
  if (agg?.code && RETRYABLE.has(agg.code)) return true;
  return (agg?.errors ?? []).some((e) => e.code && RETRYABLE.has(e.code));
}

export function isConnectivityError(error: unknown): boolean {
  if (isRetryableDbError(error)) return true;

  const message = String((error as Error)?.message ?? "");
  if (message.includes("fetch failed") || message.includes("ETIMEDOUT")) {
    return true;
  }

  const source = (error as { sourceError?: unknown })?.sourceError;
  if (source && isConnectivityError(source)) return true;
  if (hasTimeoutInAggregate((error as { cause?: unknown })?.cause)) return true;
  if (hasTimeoutInAggregate(source)) return true;

  const nested = (error as { [key: symbol]: unknown })?.[
    Symbol.for("kError")
  ] as { code?: string } | undefined;
  if (nested?.code && RETRYABLE.has(nested.code)) return true;
  return (error as { name?: string })?.name === "ErrorEvent";
}

export function isRetryableDbError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code && RETRYABLE.has(code)) return true;
  const nested = (error as { cause?: { code?: string } })?.cause?.code;
  if (nested && RETRYABLE.has(nested)) return true;
  const message = String((error as Error)?.message ?? "");
  return RETRYABLE.has(message) || message.includes("ETIMEDOUT");
}

export function connectivityErrorMessage(): string {
  return "Cannot sign in: Node cannot reach Neon from this network (psql may still work). Run: npm run sync:users:cache then retry, or USE_LOCAL_DB=1 ./start.sh dev with Docker running.";
}

/** Fast-fail reads (stock-service avoids blocking UI on Neon RTT). */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  label = "db",
  retries = 1,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === retries) throw error;
      const delay = 800 * (attempt + 1);
      console.warn(`[${label}] retry ${attempt + 1}/${retries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

/**
 * Log the full error server-side and return a generic, non-leaking message
 * to the client. Never forwards `error.message` / stack traces in the HTTP
 * response — those can expose internal paths, DB details, or provider
 * errors to anyone who can reach the route.
 */
export function apiError(
  scope: string,
  action: string,
  error: unknown,
  opts?: {
    status?: number;
    publicMessage?: string;
    meta?: Record<string, unknown>;
    body?: Record<string, unknown>;
  },
): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  log.error(scope, action, { error: message, ...opts?.meta });

  return NextResponse.json(
    {
      success: false,
      error: opts?.publicMessage ?? "Something went wrong. Please try again.",
      ...opts?.body,
    },
    { status: opts?.status ?? 500 },
  );
}

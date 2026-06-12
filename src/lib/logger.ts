/**
 * Structured application logger.
 *
 * USAGE (server-side only):
 *   import { log } from "@/lib/logger";
 *   log.info("watchlist", "addToWatchlist success", { userId, symbol });
 *   log.error("trading", "DB write failed", { error: err.message });
 *
 * OUTPUT:
 *   - Console: always (captured by Vercel Runtime Logs)
 *   - File:    data/logs/app.log  — local dev only (non-Vercel)
 *              One JSONL entry per line; view with:
 *              tail -f data/logs/app.log
 *              cat data/logs/app.log | grep '"level":"error"'
 *
 * DO NOT import this file in "use client" components. The dynamic require()
 * approach keeps node:fs out of client bundles, but the file itself is
 * intended for server-side code only (API routes, server actions, Server Components).
 */

import { canWriteLocalCache } from "@/lib/serverless";

type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: Level;
  ctx: string;
  msg: string;
  meta?: unknown;
}

const IS_PROD = process.env.NODE_ENV === "production";

/** Append a JSONL line to data/logs/app.log (local dev only). */
function writeToFile(entry: LogEntry): void {
  // Never write files in browser or on Vercel.
  if (typeof window !== "undefined") return;
  if (!canWriteLocalCache()) return;

  try {
    // Dynamic require keeps node:fs out of the client/Edge bundle while
    // still working at runtime in the Node.js server.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const dir = path.join(process.cwd(), "data", "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "app.log"), JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Never let logging errors break the application.
  }
}

function emit(level: Level, ctx: string, msg: string, meta?: unknown): void {
  // Suppress debug logs in production console (still written to file in dev).
  if (level === "debug" && IS_PROD) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    ctx,
    msg,
    ...(meta !== undefined && { meta }),
  };

  // Human-readable console line
  const tag = `[${entry.ts.slice(11, 23)}] ${level.toUpperCase().padEnd(5)} [${ctx}]`;
  const line = meta !== undefined
    ? `${tag} ${msg} ${JSON.stringify(meta)}`
    : `${tag} ${msg}`;

  switch (level) {
    case "error": console.error(line); break;
    case "warn":  console.warn(line);  break;
    case "debug": console.debug(line); break;
    default:      console.info(line);
  }

  writeToFile(entry);
}

export const log = {
  /** Verbose diagnostic — suppressed in production console output. */
  debug: (ctx: string, msg: string, meta?: unknown) => emit("debug", ctx, msg, meta),
  /** Normal operational events. */
  info:  (ctx: string, msg: string, meta?: unknown) => emit("info",  ctx, msg, meta),
  /** Recoverable problems that should be investigated. */
  warn:  (ctx: string, msg: string, meta?: unknown) => emit("warn",  ctx, msg, meta),
  /** Failures that affect users — always logged. */
  error: (ctx: string, msg: string, meta?: unknown) => emit("error", ctx, msg, meta),
};

/**
 * Recommendation outcome tracking — the feedback loop for /analysis signals.
 *
 * Vercel cron jobs invoke a path with a **GET**, carrying
 * `Authorization: Bearer $CRON_SECRET`. So GET is overloaded deliberately:
 *
 *   GET  + cron bearer  → run the loop (record today, evaluate what matured)
 *   GET  + user session → read the accuracy report
 *   POST + either       → run the loop (manual trigger / local testing)
 *
 * Do not "tidy" this by moving the cron path to POST-only — the scheduled run
 * would silently stop firing. (`/api/data/sync` has that exact shape today: its
 * GET requires a session, so the configured cron gets a 401.)
 *
 * The loop is idempotent: recording upserts on (symbol, source, date), and
 * evaluation only touches rows whose `evaluated_date_*` is still NULL.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { analyzeUniverseBundle } from "@/lib/analysis/combined-analysis";
import { getVN100Universe } from "@/lib/analysis/index-universe";
import { NO_DATA_SIGNAL } from "@/lib/analysis/technical-scoring";
import {
  ANALYSIS_SOURCE,
  evaluateDueOutcomes,
  getSignalAccuracy,
  recordSignals,
} from "@/lib/db/recommendation-outcomes";

function hasCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

/**
 * Record today's VN100 signals, then backfill any horizon that has matured.
 * VN100 is a superset of VN30 and the widest universe with tracked snapshots,
 * so one pass gives the largest sample.
 */
async function runLoop() {
  const universe = getVN100Universe();
  const bundle = await analyzeUniverseBundle(universe);

  const recorded = await recordSignals(
    bundle.combined
      // A NO DATA row has no verdict to score — recording it would add rows
      // that can never resolve to a hit and would dilute every denominator.
      .filter((row) => row.recommendation !== NO_DATA_SIGNAL)
      .map((row) => ({
        symbol: row.symbol,
        name: row.name,
        recommendation: row.recommendation,
        technicalScore: row.technicalScore,
        fundamentalScore: row.fundamentalScore,
        combinedScore: row.combinedScore,
      })),
    ANALYSIS_SOURCE,
  );

  const evaluation = await evaluateDueOutcomes();
  return { recorded: recorded.recorded, skipped: recorded.skipped, evaluation };
}

export async function GET(request: Request) {
  try {
    if (hasCronAuth(request)) {
      return NextResponse.json(await runLoop());
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source") ?? ANALYSIS_SOURCE;
    return NextResponse.json(await getSignalAccuracy(source));
  } catch (error) {
    return apiError("outcomes-api", "GET failed", error);
  }
}

export async function POST(request: Request) {
  if (!hasCronAuth(request)) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    return NextResponse.json(await runLoop());
  } catch (error) {
    return apiError("outcomes-api", "POST failed", error);
  }
}

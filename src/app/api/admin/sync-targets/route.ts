import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

// One-time migration: set 3M and LT targets for all portfolio holdings that
// currently have null targets. Safe to call multiple times — only fills nulls.
// DELETE this route after first use in production.

const TARGETS: Record<string, [number, number]> = {
  ACB:       [25,  30],
  BID:       [45,  55],
  BMP:       [150, 175],
  CMG:       [32,  45],
  CTG:       [38,  48],
  DGC:       [55,  72],
  DHG:       [105, 125],
  E1VFVN30:  [37,  42],
  FPT:       [80,  120],
  FUESSVFL:  [33,  42],
  FUEVFVND:  [39,  46],
  GVR:       [38,  48],
  HPG:       [28,  36],
  KDH:       [30,  38],
  MBB:       [27,  32],
  MSN:       [82,  100],
  MWG:       [90,  110],
  NLG:       [30,  38],
  NTP:       [60,  75],
  PNJ:       [80,  105],
  REE:       [60,  82],
  SSI:       [32,  42],
  TCB:       [36,  46],
  VCB:       [67,  80],
  VCG:       [23,  28],
  VNM:       [66,  78],
  VRE:       [33,  42],
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const results: Record<string, string> = {};

  for (const [symbol, [t3m, tlt]] of Object.entries(TARGETS)) {
    const updated = await withDbRetry(
      () =>
        prisma.portfolioHolding.updateMany({
          where: { userId, symbol },
          data: { target3Month: t3m, targetLongTerm: tlt },
        }),
      `sync-targets-${symbol}`,
      0,
    );
    results[symbol] = updated.count > 0 ? `✓ set 3M=${t3m} LT=${tlt}` : "not found";
  }

  return NextResponse.json({ success: true, results });
}

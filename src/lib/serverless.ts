/** True when running on Vercel (or similar read-only filesystem serverless). */
export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Local JSON under `data/` is only reliable on a persistent disk. */
export function canUseLocalDataFiles(): boolean {
  return !isVercel();
}

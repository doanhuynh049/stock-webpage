/**
 * Export app_user from Neon via psql → data/neon-cache/app-users.json
 * Used when Node cannot reach Neon but psql can (common on restricted networks).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config();

function cleanUrl(url: string): string {
  return url
    .replace(/[?&]uselibpqcompat=true/g, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
}

function main() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    console.error("[sync-users-cache] DATABASE_URL not set");
    process.exit(1);
  }
  if (!raw.includes("neon.tech")) {
    console.log("[sync-users-cache] Not a Neon URL — skip");
    return;
  }

  const url = cleanUrl(raw);
  const tmp = join("/tmp", `app-users-${Date.now()}.csv`);

  try {
    execSync(
      `psql "${url}" -v ON_ERROR_STOP=1 -c "\\copy (SELECT id, username, email, password_hash, status, role FROM app_user ORDER BY created_at) TO '${tmp}' WITH (FORMAT csv, DELIMITER '|', HEADER true)"`,
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    console.error("[sync-users-cache] psql export failed:", (e as Error).message);
    process.exit(1);
  }

  const csv = readFileSync(tmp, "utf-8").trim();
  const lines = csv.split("\n");
  if (lines.length < 2) {
    console.warn("[sync-users-cache] No users exported");
    return;
  }

  const users: Array<{
    id: string;
    username: string;
    email: string | null;
    passwordHash: string;
    status: string;
    role: string;
  }> = [];

  for (const line of lines.slice(1)) {
    const parts = line.split("|");
    if (parts.length < 6) continue;
    const [id, username, email, passwordHash, status, role] = parts;
    users.push({
      id,
      username,
      email: email || null,
      passwordHash,
      status,
      role,
    });
  }

  const outDir = join(process.cwd(), "data", "neon-cache");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "app-users.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), users }, null, 2),
  );
  console.log(`[sync-users-cache] OK — ${users.length} user(s)`);
}

main();

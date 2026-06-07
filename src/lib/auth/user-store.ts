import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { isPersistenceEnabled } from "@/lib/persistence";
import { isConnectivityError, withDbRetry } from "@/lib/prisma-query";

export type AuthUserRow = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  status: string;
  role: string;
};

const CACHE_FILE = join(process.cwd(), "data", "neon-cache", "app-users.json");

function readLocalUsers(): AuthUserRow[] {
  if (!existsSync(CACHE_FILE)) return [];
  try {
    const raw = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as {
      users?: AuthUserRow[];
    };
    return raw.users ?? [];
  } catch {
    return [];
  }
}

function findLocalUserByEmail(email: string): AuthUserRow | null {
  const norm = email.toLowerCase().trim();
  return readLocalUsers().find((u) => u.email?.toLowerCase() === norm) ?? null;
}

/** DB first; on ETIMEDOUT fall back to psql-exported JSON cache (login when Node cannot reach Neon). */
export async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const norm = email.toLowerCase().trim();
  if (!norm || !isPersistenceEnabled()) return null;

  try {
    const user = await withDbRetry(
      () => prisma.appUser.findUnique({ where: { email: norm } }),
      "auth-user",
      1,
    );
    if (user) {
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        status: user.status,
        role: user.role,
      };
    }
    return null;
  } catch (error) {
    if (!isConnectivityError(error)) throw error;
    console.warn("[auth] DB unreachable — using local user cache:", (error as Error).message);
    return findLocalUserByEmail(norm);
  }
}

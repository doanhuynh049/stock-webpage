/**
 * Converts stock-service JDBC URL to libpq format for Prisma/node-postgres.
 * JDBC:  jdbc:postgresql://HOST/neondb?user=U&password=P&sslmode=require
 * libpq: postgresql://U:P@HOST/neondb?sslmode=require
 */
export function jdbcToLibpq(jdbcUrl: string): string {
  if (!jdbcUrl.startsWith("jdbc:")) return jdbcUrl;
  const parsed = new URL(jdbcUrl.slice(5));
  const user = parsed.searchParams.get("user") ?? "";
  const password = parsed.searchParams.get("password") ?? "";
  parsed.searchParams.delete("user");
  parsed.searchParams.delete("password");
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
}

/** DATABASE_URL (libpq) or DB_URL (JDBC from stock-service) */
export function resolveDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;
  const jdbc = process.env.DB_URL?.trim();
  if (jdbc) return jdbcToLibpq(jdbc);
  return "";
}

/**
 * Runtime override — use when Neon is reachable by `prisma db push` but not by Node
 * (e.g. set RUNTIME_DATABASE_URL to local Docker while keeping Neon for migrations).
 */
export function resolveRuntimeDatabaseUrl(): string {
  const runtime =
    process.env.RUNTIME_DATABASE_URL?.trim() ||
    process.env.LOCAL_DATABASE_URL?.trim();
  if (runtime) return runtime;
  return resolveDatabaseUrl();
}

export function isNeonDatabase(url: string): boolean {
  return url.includes("neon.tech");
}

/**
 * Normalizes DATABASE_URL for node-postgres / Neon serverless SSL semantics.
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
export function normalizeDatabaseUrl(url: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url);

    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    ) {
      return url;
    }

    const sslmode = parsed.searchParams.get("sslmode");

    if (parsed.hostname.includes("neon.tech")) {
      if (sslmode === "require" && !parsed.searchParams.has("uselibpqcompat")) {
        parsed.searchParams.set("uselibpqcompat", "true");
      }
      if (!parsed.searchParams.has("connect_timeout")) {
        parsed.searchParams.set("connect_timeout", "8");
      }
      return parsed.toString();
    }

    if (
      sslmode === "require" &&
      !parsed.searchParams.has("uselibpqcompat")
    ) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-utils";
import { findUserByEmail } from "@/lib/auth/user-store";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import {
  connectivityErrorMessage,
  isConnectivityError,
  withDbRetry,
} from "@/lib/prisma-query";

async function uniqueUsername(
  email: string,
  displayName?: string | null,
): Promise<string> {
  const base = (displayName || email.split("@")[0])
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 24)
    .toLowerCase() || "user";

  let candidate = base;
  for (let n = 0; n < 20; n++) {
    const taken = await prisma.appUser.findUnique({
      where: { username: candidate },
    });
    if (!taken) return candidate;
    candidate = `${base}${n + 1}`;
  }
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

function dbErrorMessage(error: unknown): string {
  if (isConnectivityError(error)) return connectivityErrorMessage();
  const code = (error as { code?: string })?.code;
  if (code === "P1000" || code === "P1001") {
    return "Database is not ready. Check DATABASE_URL in .env";
  }
  return "Something went wrong. Please try again.";
}

export async function registerUser(formData: FormData) {
  const name = (formData.get("name") as string)?.trim() || null;
  const email = normalizeEmail((formData.get("email") as string) ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  if (!isPersistenceEnabled()) {
    return { error: "Database persistence is disabled. Set PERSISTENCE_ENABLED=true in .env" };
  }

  try {
    const existing = await prisma.appUser.findUnique({ where: { email } });
    if (existing) return { error: "Email already registered" };

    const passwordHash = await bcrypt.hash(password, 10);
    const username = await uniqueUsername(email, name);

    await prisma.appUser.create({
      data: {
        id: randomUUID(),
        username,
        email,
        passwordHash,
        status: "ACTIVE",
        role: "USER",
      },
    });

    return { success: true, email };
  } catch (error) {
    console.error("[registerUser]", error);
    return { error: dbErrorMessage(error) };
  }
}

export type AuthResult = { success: true } | { error: string };

export async function loginUser(formData: FormData): Promise<AuthResult> {
  const email = normalizeEmail((formData.get("email") as string) ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (!isPersistenceEnabled()) {
    return { error: "Database persistence is disabled. Set PERSISTENCE_ENABLED=true in .env" };
  }

  try {
    const user = await findUserByEmail(email);

    if (!user || user.status !== "ACTIVE") {
      return { error: "Invalid email or password" };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return { error: "Invalid email or password" };
    }

    const callback = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (typeof callback === "string" && callback.includes("error=")) {
      return { error: "Invalid email or password" };
    }
    return { success: true };
  } catch (error) {
    if (isConnectivityError(error)) {
      console.warn("[loginUser] DB unreachable:", (error as Error).message);
      return { error: connectivityErrorMessage() };
    }
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    console.error("[loginUser]", error);
    return { error: "Sign in failed. Please try again." };
  }
}

export async function registerAndSignIn(
  formData: FormData,
): Promise<AuthResult> {
  const password = String(formData.get("password") ?? "");
  const result = await registerUser(formData);

  if ("error" in result && result.error) return { error: result.error };
  if (!("email" in result) || !result.email) {
    return { error: "Registration failed" };
  }

  try {
    await signIn("credentials", {
      email: result.email,
      password,
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    console.error("[registerAndSignIn]", error);
    return {
      error:
        "Account created. Please sign in with the same email and password.",
    };
  }
}

export async function addToWatchlist(symbol: string) {
  const userId = await requireUser();
  const sym = symbol.trim().toUpperCase();
  if (!sym || !/^[A-Z0-9]{2,8}$/.test(sym)) {
    throw new Error("Enter a valid ticker symbol (e.g. FPT, VPB)");
  }

  try {
    await withDbRetry(
      () =>
        prisma.watchlistItem.upsert({
          where: { userId_symbol: { userId, symbol: sym } },
          create: { userId, symbol: sym },
          update: {},
        }),
      "watchlist-add",
      0,
    );
  } catch (error) {
    console.error("[addToWatchlist]", error);
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/");
  revalidatePath(`/stocks/${sym}`);
  return { success: true };
}

export async function removeFromWatchlist(symbol: string) {
  const userId = await requireUser();
  const sym = symbol.toUpperCase();

  try {
    await withDbRetry(
      () =>
        prisma.watchlistItem.deleteMany({
          where: { userId, symbol: sym },
        }),
      "watchlist-remove",
      0,
    );
  } catch (error) {
    console.error("[removeFromWatchlist]", error);
    throw new Error(dbErrorMessage(error));
  }

  revalidatePath("/watchlist");
  revalidatePath("/");
  return { success: true };
}

export async function saveAiMessage(
  sessionId: string | null,
  question: string,
  answer: string,
) {
  const userId = await requireUser();

  let session = sessionId
    ? await prisma.aiChatSession.findFirst({
        where: { id: sessionId, userId },
      })
    : null;

  if (!session) {
    session = await prisma.aiChatSession.create({
      data: {
        userId,
        title: question.slice(0, 60),
      },
    });
  }

  await prisma.aiChatMessage.createMany({
    data: [
      { sessionId: session.id, role: "user", content: question },
      { sessionId: session.id, role: "assistant", content: answer },
    ],
  });

  return { sessionId: session.id };
}

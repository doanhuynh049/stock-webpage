import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/auth-utils";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { isConnectivityError, withDbRetry } from "@/lib/prisma-query";

const authSecret = process.env.AUTH_SECRET;

if (!authSecret) {
  console.warn(
    "[auth] AUTH_SECRET is not set. Sessions will fail. Run: openssl rand -base64 32",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = normalizeEmail(String(credentials?.email ?? ""));
        const password = String(credentials?.password ?? "");

        if (!email || !password) {
          console.warn("[auth] Missing email or password");
          return null;
        }

        try {
          if (!isPersistenceEnabled()) {
            console.warn("[auth] Persistence disabled — cannot sign in");
            return null;
          }

          const user = await withDbRetry(
            () => prisma.appUser.findUnique({ where: { email } }),
            "auth",
            2,
          );

          if (!user || user.status !== "ACTIVE") {
            console.warn("[auth] No active user for email:", email);
            return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
            console.warn("[auth] Invalid password for:", email);
            return null;
          }

          return {
            id: user.id,
            email: user.email ?? email,
            name: user.username,
          };
        } catch (error) {
          if (isConnectivityError(error)) throw error;
          console.error("[auth] Database error during login:", error);
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

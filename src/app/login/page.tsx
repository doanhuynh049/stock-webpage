"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginUser, registerAndSignIn } from "@/lib/actions";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const result = isRegister
      ? await registerAndSignIn(formData)
      : await loginUser(formData);

    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/");
    setLoading(false);
    void router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <div className="ticker-led hidden flex-1 flex-col justify-between p-12 lg:flex">
        <div className="relative z-[1] flex items-center gap-3">
          <BrandLogo size="lg" />
          <div>
            <span className="text-xl font-bold text-[#f5f0e6]">VN Stocks</span>
            <p className="font-data text-[10px] uppercase tracking-widest text-[var(--ticker-dim)]">
              HOSE · HNX · UPCOM
            </p>
          </div>
        </div>

        <div className="relative z-[1]">
          <p className="ticker-led-label text-[10px] font-bold uppercase tracking-[0.2em]">
            Vietnam Equities Terminal
          </p>
          <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-[#f5f0e6]">
            Board data.
            <br />
            Portfolio ledger.
            <br />
            AI analysis.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--ticker-dim)]">
            Track VN-Index, screen opportunities, manage holdings, and run
            multi-agent analyst reports — synced twice daily.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { label: "VN-Index", value: "1,800+" },
              { label: "Stocks", value: "18+" },
              { label: "Sectors", value: "8" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[var(--ticker-border)] bg-black/25 px-4 py-3"
              >
                <p className="ticker-led-label text-[9px] font-bold uppercase">
                  {s.label}
                </p>
                <p className="ticker-led-value mt-1 text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-[1] font-data text-[10px] uppercase tracking-widest text-[var(--ticker-dim)]">
          Session-gated · credentials only
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[var(--bg)] p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo size="md" />
            <span className="text-lg font-bold text-[var(--fg)]">VN Stocks</span>
          </div>

          <div className="mb-4 flex justify-end">
            <ThemeToggle />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
            {isRegister ? "Create account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isRegister
              ? "Start tracking your Vietnam stock portfolio"
              : "Sign in to access watchlist, portfolio & AI analyst"}
          </p>

          <form
            method="post"
            action="/login"
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
            autoComplete="on"
          >
            {isRegister && (
              <div>
                <Label>Name</Label>
                <Input name="name" placeholder="Your name" autoComplete="name" />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                required
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                minLength={6}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-danger ring-1 ring-red-500/20">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Please wait..." : isRegister ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
              className="link-accent"
            >
              {isRegister ? "Sign in" : "Register"}
            </button>
          </p>

          <p className="mt-6 text-center">
            <Link href="/" className="text-xs text-subtle hover:text-muted">
              ← Continue without signing in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

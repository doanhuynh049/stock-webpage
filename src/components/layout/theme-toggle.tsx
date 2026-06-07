"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className={cn("h-9 w-9 rounded-xl bg-[var(--bg-secondary)]", className)} />
    );
  }

  const cycle = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const Icon =
    theme === "system"
      ? Monitor
      : resolvedTheme === "dark"
        ? Moon
        : Sun;

  const label =
    theme === "system"
      ? "System theme"
      : resolvedTheme === "dark"
        ? "Dark mode"
        : "Light mode";

  return (
    <button
      onClick={cycle}
      title={label}
      aria-label={`Theme: ${label}. Click to switch.`}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--fg-muted)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

"use client";

import { SessionProvider } from "next-auth/react";
import { AppThemeProvider } from "@/components/theme/theme-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AppThemeProvider>{children}</AppThemeProvider>
    </SessionProvider>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MarketTicker } from "@/components/layout/market-ticker";

export function ShellContent({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; email?: string | null } | null;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    return <div className="mesh-bg min-h-screen">{children}</div>;
  }

  return (
    <div className="mesh-bg flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <MarketTicker />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="w-full px-3 py-3 sm:px-4 sm:py-4">{children}</div>
        </main>
      </div>
    </div>
  );
}

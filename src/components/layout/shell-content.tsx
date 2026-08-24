"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MarketTicker } from "@/components/layout/market-ticker";

export function ShellContent({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; email?: string | null } | null;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAuthPage = pathname === "/login";

  // Close the mobile drawer on route change. Adjusted during render (React's
  // recommended pattern for "reset state when a prop changes") instead of an
  // effect, so there's no extra post-navigation render with the drawer still open.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileNavOpen(false);
  }

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  if (isAuthPage) {
    return <div className="mesh-bg min-h-[100dvh]">{children}</div>;
  }

  const closeMobile = () => setMobileNavOpen(false);

  return (
    <div className="mesh-bg flex h-[100dvh] overflow-hidden">
      {/* Desktop full sidebar */}
      <Sidebar user={user} className="hidden shrink-0 lg:flex" />

      {/* iPad / tablet: icon rail */}
      <Sidebar user={user} compact className="hidden shrink-0 md:flex lg:hidden" />

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      )}
      <Sidebar
        user={user}
        mobile
        open={mobileNavOpen}
        onClose={closeMobile}
        onNavigate={closeMobile}
        className="md:hidden"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileHeader onOpenMenu={() => setMobileNavOpen(true)} />
        <MarketTicker />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <div className="page-container w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        router.replace("/");
        void signOut({ redirect: false }).then(() => router.refresh());
      }}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-white/5 hover:text-zinc-400"
    >
      <LogOut className="h-3.5 w-3.5" />
      Sign out
    </button>
  );
}

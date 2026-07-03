"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-[var(--border)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--fg)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back
    </button>
  );
}

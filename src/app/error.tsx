"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="h-7 w-7 text-danger" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="max-w-sm text-sm text-muted">
          A temporary error occurred. This is usually a network or database
          connectivity issue.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-subtle">
            digest: {error.digest}
          </p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

export function PageLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-48 rounded-lg bg-[var(--bg-secondary)]" />
      <div className="h-4 w-96 max-w-full rounded bg-[var(--bg-secondary)]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]" />
    </div>
  );
}

export default function Loading() {
  return <PageLoadingSkeleton />;
}

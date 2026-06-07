import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  glow,
}: {
  className?: string;
  children: React.ReactNode;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-5 transition-all duration-300",
        glow && "ring-1 ring-[var(--accent)]/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  action,
}: {
  className?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
        {children}
      </h3>
      {action}
    </div>
  );
}

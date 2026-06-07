import { cn } from "@/lib/utils";

export function Badge({
  children,
  variant = "default",
  className,
  style,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "danger" | "warning" | "info";
  className?: string;
  style?: React.CSSProperties;
}) {
  const variants = {
    default: "bg-[var(--bg-secondary)] text-[var(--fg-muted)] ring-1 ring-[var(--border)]",
    success: "bg-[var(--accent-bg)] text-[var(--success)] ring-1 ring-[var(--accent)]/25",
    danger: "bg-red-500/10 text-[var(--danger)] ring-1 ring-red-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20",
    info: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/20",
  };

  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  badge,
  action,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4", className)}>
      <div className="min-w-0 animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="gradient-text">{title}</span>
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {(badge || action) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          {badge}
          {action}
        </div>
      )}
    </div>
  );
}

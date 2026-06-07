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
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="animate-fade-up">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="gradient-text">{title}</span>
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {badge}
        {action}
      </div>
    </div>
  );
}

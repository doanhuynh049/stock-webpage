"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function FormModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  options,
  className,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer: React.ReactNode;
  options?: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:max-w-lg sm:rounded-2xl",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="form-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 shrink-0 bg-[var(--accent)]" />

        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h3 id="form-modal-title" className="text-base font-semibold text-[var(--fg)]">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted ring-1 ring-transparent hover:bg-[var(--bg-secondary)] hover:ring-[var(--border)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50 px-4 py-3.5 safe-bottom sm:px-5">
          {options && <div className="mb-3">{options}</div>}
          <div className="flex flex-wrap items-center gap-2">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function ModalCheckbox({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-[var(--fg)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[10px] text-subtle">{description}</span>
        )}
      </span>
    </label>
  );
}

export const modalFieldClass =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--fg)] outline-none ring-0 transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

export const modalLabelClass = "text-[11px] font-medium uppercase tracking-wide text-subtle";

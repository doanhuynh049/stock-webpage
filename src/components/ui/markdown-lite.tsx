"use client";

import Link from "next/link";

/** Minimal markdown renderer for AI replies (headers, bullets, bold, links). */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={i} className="mt-3 text-sm font-semibold text-[var(--fg)]">
              {renderInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={i} className="mt-3 text-base font-semibold text-[var(--fg)]">
              {renderInline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={i} className="mt-3 text-lg font-bold text-[var(--fg)]">
              {renderInline(trimmed.slice(2))}
            </h2>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 pl-1 text-muted">
              <span className="text-accent">•</span>
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const body = trimmed.replace(/^\d+\.\s/, "");
          const num = trimmed.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} className="flex gap-2 pl-1 text-muted">
              <span className="min-w-[1.25rem] font-medium text-subtle">{num}.</span>
              <span>{renderInline(body)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("|") && trimmed.includes("|")) {
          return (
            <p key={i} className="font-mono text-xs text-muted">
              {trimmed}
            </p>
          );
        }
        if (trimmed.startsWith("*") && trimmed.endsWith("*") && !trimmed.startsWith("**")) {
          return (
            <p key={i} className="text-xs italic text-subtle">
              {renderInline(trimmed.slice(1, -1))}
            </p>
          );
        }
        return (
          <p key={i} className="text-muted">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--fg)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = link[2];
      const label = link[1];
      if (href.startsWith("/")) {
        return (
          <Link key={i} href={href} className="text-accent hover:underline">
            {label}
          </Link>
        );
      }
      return (
        <a key={i} href={href} className="text-accent hover:underline" target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    return part;
  });
}

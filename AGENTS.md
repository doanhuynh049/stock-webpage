<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project knowledge

Read `.cursor/skills/stock-webpage/SKILL.md` before editing this repo.

| Doc | Path |
|-----|------|
| Skill (overview) | `.cursor/skills/stock-webpage/SKILL.md` |
| Components & APIs | `.cursor/skills/stock-webpage/components.md` |
| DB, cache, Vercel | `.cursor/skills/stock-webpage/data-flow.md` |

## Cursor rules

| Rule | Purpose |
|------|---------|
| `action-first-navigation.mdc` | NavLink pending state, optimistic mutations |
| `page-state-cache.mdc` | Server `unstable_cache`, page cache keys |
| `vercel-cache.mdc` | No `.cache` on Vercel; localStorage client cache |
| `theme-aware-interactive.mdc` | Always use `text-accent-fg` (not `text-white`) with `bg-accent`; `--color-accent` must be in `@theme inline` |
| `settings-page-pattern.mdc` | Settings pages: full-panel layout, no `max-w-*`, server+client split, DB key ≤16 chars |
| `ai-screening-pattern.mdc` | AI-scored/ranked features: client/server config split (avoid leaking Prisma/fs into client bundle), `technical_snapshot.price` is in thousands of VND, AI explains a score but never computes one |

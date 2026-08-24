@AGENTS.md

## Project skill

For architecture, components, and conventions, read `.cursor/skills/stock-webpage/SKILL.md`.

- Component catalog: `.cursor/skills/stock-webpage/components.md`
- DB / trading / Vercel ops: `.cursor/skills/stock-webpage/data-flow.md`

## Cursor rules

- `action-first-navigation.mdc` — optimistic UI, NavLink pending state
- `page-state-cache.mdc` — server page cache keys and invalidation
- `vercel-cache.mdc` — no disk cache on Vercel; use localStorage for news/market
- `theme-aware-interactive.mdc` — use `text-accent-fg` not `text-white` with `bg-accent`
- `settings-page-pattern.mdc` — settings pages: full-panel, no max-w, DB key ≤16 chars
- `ai-screening-pattern.mdc` — AI-scored/ranked features: client/server config split, VND price units, AI explains-never-scores
- `analysis-page-prefetch.mdc` — /analysis background-prefetches every tab (incl. LLM-backed ones) on first paint; pattern for adding a new lazily-loaded tab

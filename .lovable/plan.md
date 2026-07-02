# Global UI Cleanup — Soft Modern

Presentation-only refresh across the entire app. No changes to business logic, data, calculations, numbering, approval, workflow, routes, or component behavior. Only tokens, spacing, typography, and shell styling.

## Design direction

**Soft Modern** — warm neutral base, emerald accent, gentle rounded surfaces.

- Base bg: `#FAFAF9` (warm off-white)
- Surface / card: `#FFFFFF` on `#F5F5F4` muted
- Ink / foreground: `#1F2937`
- Accent (primary): `#059669` emerald
- Border: `#E7E5E4` (stone-200)
- Radius: `--radius: 0.75rem`
- Shadow: soft, low-spread (`0 1px 2px + 0 8px 24px -12px`)
- Typography: Inter for body, Plus Jakarta Sans for headings (via `@fontsource`)

All colors defined as HSL semantic tokens in `src/index.css`; Tailwind stays token-based. No hardcoded `bg-white`/`text-black` in components — we swap only where such hardcoding already exists in shell/layout files.

## What changes

1. **Design tokens** — `src/index.css` and `tailwind.config.ts`
   - Rewrite `:root` and `.dark` HSL variables to the Soft Modern palette
   - Update `--radius`, add `--shadow-soft`, `--shadow-elevated`
   - Register Jakarta/Inter font families

2. **Fonts** — install `@fontsource/plus-jakarta-sans` and `@fontsource/inter`, import in `src/main.tsx`

3. **App shell polish** (visual only, no behavior)
   - `src/components/layout/*` (Sidebar, Header/Topbar, PageContainer if present): tighter spacing scale, softer dividers, consistent section padding, sticky header shadow-on-scroll class
   - Replace any hardcoded gray/white utilities with semantic tokens

4. **Reusable primitives** (shadcn variants — visual tweaks only)
   - `button.tsx`: refined default/secondary/ghost, subtle hover, focus ring in emerald
   - `card.tsx`: softer border, `shadow-soft`, consistent padding
   - `badge.tsx`: quieter neutral, emerald for approved, amber for pending, rose for rejected
   - `input.tsx`, `select.tsx`, `textarea.tsx`: unified height, border, focus ring
   - `table.tsx`: zebra off, tighter header, muted borders, sticky header class
   - `tabs.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`: aligned radius/shadow

5. **Page-level de-clutter (CSS only)**
   - Standardize page header pattern (title, subtitle, actions right) via existing shared components
   - Consistent gap between filter bar / table / pagination
   - Empty states get a light neutral panel treatment

## Explicit non-goals (guardrails)

- No changes to: OA, BOQ, Design, Manufacturing, Purchase, GRN, PI, Costing, Requisition, Annexure logic
- No changes to: approval sync, revision carry-forward, snapshots, notifications, PDF exports, calculations, GST, numbering, access control, Save Draft / Finalize / Convert to PI
- No route, prop, or API signature changes
- No component removed or renamed; only styling and token usage adjusted

## Files touched (estimated)

- `src/index.css` (tokens)
- `tailwind.config.ts` (fonts, radius extensions)
- `src/main.tsx` (font imports)
- `src/components/layout/**` (shell)
- `src/components/ui/{button,card,badge,input,select,textarea,table,tabs,dialog,dropdown-menu,tooltip}.tsx` (variant styling)
- Grep-and-swap hardcoded `bg-white|text-black|bg-gray-*|text-gray-*` occurrences in layout/shared components only

## Verification

- Build passes
- Spot-check: `/orders/:id` (current view), OA list, BOQ list, Design BOQ, Manufacturing, Purchase folder, GRN — visually cleaner, no functional regressions
- No changes to any test file behavior

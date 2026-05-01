## Goal

Move the **Revision History** panel from below the OA editor to a **right-side rail** so the user can see the full revision history (OA + linked BOQs, Edit/View, OA PDF / BOQ PDF download buttons) alongside the OA being edited — exactly as in the uploaded screenshot.

## Layout change

Currently in `src/pages/orders/OrderEditor.tsx`, the page renders a single vertical column inside `max-w-7xl mx-auto space-y-5`, with `<RevisionsPanel />` placed at the bottom (around line 480).

Change the page body to a **two-column grid on large screens**:

```text
┌─ Top header bar (OA number, action buttons) ─ unchanged, full width ─┐
│                                                                       │
├──────────────────────────────────┬────────────────────────────────────┤
│  LEFT (main, ~2/3 width)         │  RIGHT (rail, ~1/3 width)          │
│  • Revision badge banner         │  • Revision History card           │
│  • Header form                   │    (sticky on scroll)              │
│  • Line items                    │                                    │
│  • Charges / totals              │                                    │
│  • Live preview                  │                                    │
└──────────────────────────────────┴────────────────────────────────────┘
```

- Use Tailwind: outer `grid grid-cols-1 lg:grid-cols-3 gap-5`, left column `lg:col-span-2 space-y-5`, right column `lg:col-span-1`.
- Wrap `<RevisionsPanel />` in a `lg:sticky lg:top-20` container so it stays in view while the user scrolls/edits the OA.
- On screens smaller than `lg`, the right rail collapses to a full-width section below the OA (mobile-friendly fallback).
- The full-width top header (OA number + action buttons + revision banners) stays above the grid so it spans the entire width as it does today.

## Revisions panel polish (so it matches the screenshot)

`src/components/orders/RevisionsPanel.tsx` already shows everything needed:
- OA row: Current/Superseded badge, OA number, Rev N, status, date, Edit/View, **OA PDF** download.
- Indented BOQ rows under each OA: Current/Superseded badge, BOQ number, Rev N, status, date, Edit/View, **BOQ PDF** download.

Minor tweaks for the narrower right-rail width:
- Reduce horizontal padding inside rows (`px-3` → `px-2.5`) and tighten gaps so content doesn't wrap awkwardly at ~400px column width.
- Allow the action buttons (`Edit/View`, `OA PDF`, `BOQ PDF`) to wrap to a second line if needed by adding `flex-wrap` to the button cluster.
- Keep the orange **Current** pill, the muted **Superseded** chip, and the monospace Rev/number styling as in the screenshot.

## Files to change

- `src/pages/orders/OrderEditor.tsx` — restructure the body into a two-column grid; move `<RevisionsPanel />` into the right column inside a sticky wrapper.
- `src/components/orders/RevisionsPanel.tsx` — small responsive polish (padding, flex-wrap on action buttons) so it reads cleanly in the narrower rail.

No data, schema, or PDF logic changes.

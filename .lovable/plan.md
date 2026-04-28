## Goal

Make "New OA" open a chooser screen first — pick between **Upload a Cost Sheet** or **Create Blank Manually** — then proceed into the existing editor. The current editor jumps straight into a blank form, which hides the upload flow.

## Changes

### 1. New chooser page — `src/pages/orders/NewOrderChooser.tsx`

A clean, on-brand landing page shown at `/orders/new`. Two large option cards:

- **Upload Cost Sheet** — embeds the existing `CostSheetPicker`. After AI extraction completes, automatically forwards the extracted data into the editor via router state (`navigate("/orders/new/edit", { state: { extracted } })`).
- **Create Blank Manually** — links to `/orders/new/edit` with no state, opening the empty editor.

Layout: centered max-w-3xl, page title "Create New Order Acceptance", subtitle, then a 2-column grid of option cards (icon tile, title, description, primary CTA). Matches the orange/white theme already in use (`rounded-xl`, `border-border/70`, primary-tinted icon backgrounds).

### 2. Route changes — `src/App.tsx`

```text
/orders/new        → NewOrderChooser  (new)
/orders/new/edit   → OrderEditor      (blank or pre-filled via state)
/orders/:id        → OrderEditor      (existing — unchanged)
```

### 3. Editor accepts pre-filled data — `src/pages/orders/OrderEditor.tsx`

- Read `useLocation().state?.extracted` on mount. If present, run the same population logic that `CostSheetPicker.onApply` already triggers inside the editor today (set company name, format, addresses, items, charges, notes). The existing `applyCostSheet`-style block is reused.
- The in-editor `CostSheetPicker` panel remains, so users can still re-upload from inside the editor if they want.
- `isNew` detection updated: treat both `id === undefined` and the `/orders/new/edit` path as "new".

### 4. Sidebar — `src/components/AppSidebar.tsx`

"New OA" item keeps pointing to `/orders/new` (now the chooser). Active-state matching already uses `startsWith`, so `/orders/new/edit` will also highlight it correctly.

### 5. Dashboard quick actions — `src/pages/Index.tsx`

The "New OA" quick-action card already links to `/orders/new` — no change needed; it now naturally lands on the chooser.

## Out of scope

- No changes to calculation logic (`src/lib/orders/calc.ts`), PDF generation, Supabase schema, or `OrderPreview`.
- No styling changes outside the new chooser page and minimal editor wiring.

## Technical notes

- Pass extracted data through `react-router` location state to avoid a global store.
- The chooser's "Upload" card auto-navigates as soon as `CostSheetPicker.onApply` fires (current behaviour in `QuickOrderPanel` already shows a manual "Continue" button — we'll auto-forward instead so the user lands directly in the editable form with fields populated).
- All existing functionality (manual OA entry, GMS/MR detection, charges-as-percent toggles, PDF export) remains intact.
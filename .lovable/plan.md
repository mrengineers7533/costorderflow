# Sidebar-Driven Access Control

Align permissions 1:1 with the left sidebar so each menu entry has exactly one access toggle. Hide menu when not allowed; block direct URL visit with the existing "Access Denied" screen.

## What changes

### 1. Module keys (`src/lib/access/modules.ts`)
Replace the 3 separate Costing-child keys with a single `costing` parent, and split Annexure out of Requisitions. Final list shown in Admin → Access Control matches the sidebar exactly:

```text
dashboard, costing, design, notifications, workflow, purchase,
manufacturing, requisitions, annexures, raw_materials, grn,
reports, cost_sheets
```

(`orders`, `boqs`, `pi` keys are removed from the picker — they are covered by `costing`.)

### 2. Sidebar (`src/components/AppSidebar.tsx`)
- Costing parent visible only if user has `costing` (or is admin). When open, Orders / BOQ / PI children always show — no per-child permission check.
- New "Annexure Folder" entry gated by `annexures`.
- All other sidebar entries keep their current 1:1 module key.

### 3. Route guards (`src/App.tsx`)
- `/orders`, `/orders/*`, `/boqs`, `/boqs/*`, `/pi`, `/pi/*` → `RequireModule module="costing"`.
- `/requisitions/annexures` and `/annexures/:annexureId/po/new` → `RequireModule module="annexures"` (keep `purchase` check for PO create page via a combined check: require either — simplest: keep `annexures` for the annexure list, leave PO-create on `purchase`).
- Everything else unchanged.

Unauthorized direct visits already render `AccessDenied` via `RequireModule` — no new component needed.

### 4. Admin Access Control page
Driven by the `MODULES` array, so it updates automatically. No code edit there beyond the new keys.

### 5. Data backfill (one migration, additive only)
For every user that currently has any of `orders`, `boqs`, `pi` → insert `costing`.
For every user that currently has `requisitions` → also insert `annexures` (so today's requisition users keep seeing the Annexure Folder).
Then delete the now-unused `orders` / `boqs` / `pi` rows from `user_module_access`.
No table schema change; no RLS change; no business-logic change.

## Out of scope (explicitly unchanged)
OA, BOQ, PI, Purchase, Manufacturing, Requisition, Annexure, GRN, Design, Workflow, Costing — all calculation, approval, revision, notification, and data-saving logic untouched. No new tables, no policy edits, no edge-function changes.

## Files touched
- `src/lib/access/modules.ts` (edit list)
- `src/components/AppSidebar.tsx` (Costing gating + Annexure entry already wired to module key)
- `src/App.tsx` (swap module names on the 3 Costing route groups + the Annexure route)
- one new `supabase/migrations/*.sql` (backfill described above)

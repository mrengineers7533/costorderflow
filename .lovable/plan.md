## Goal

Collapse the BOQ Folder so it lists only the **latest revision** per BOQ family, and surface all sibling revisions inside the latest BOQ's editor page with one-click read-only open.

Nothing about saving, calculations, OA/PI sync, permissions, or snapshot data changes. We only adjust list filtering, sorting, counts, and add a revision-history panel on the editor.

## Changes

### 1. `src/pages/boqs/BoqList.tsx` — default to current-only

- Flip the default of `showSuperseded` from `true` → `false`, so the folder shows only `is_current = true` rows on load (the existing query already filters when the toggle is off). The toggle stays available for admin/debug use, just hidden by default.
- Update the `counts` memo to count only current rows (since `rows` will then only contain currents, no extra logic needed — counts auto-reflect).
- Sort sibling revisions in the expand-row family view numerically (`revision ?? 0` ascending — already numeric, just confirm the `.order("revision", { ascending: true })` query is used; `R10` issue only happens with text sort, our column is numeric so already correct — no change required, but the inline label generator already strips/appends `/Rn` correctly).
- Keep the chevron expand row so users can still peek siblings inline.

### 2. `src/pages/boqs/BoqEditor.tsx` — add BOQ Revision History panel

- Below the existing design-review `RevisionsTable` (which is a separate concept — design-review snapshots), add a new **"BOQ Revision History"** card listing every BOQ in the same OA family (same logic as `loadFamilyFor` in `BoqList`).
- Each row: revision label (`Rn`), BOQ number, date, status badge (**Current** if `is_current`, otherwise **Superseded**), and a **View** button.
- Clicking **View** navigates to `/boqs/<that-id>`. The editor already enforces edit-permission rules per record, so older non-current rows naturally render read-only for everyone except the original creator path; we'll also force a read-only banner when `!is_current` so it's explicit.
- Sort numerically by `revision` ascending. R0, R1, R2 … R10 — no string sort.

### 3. New component `src/components/boqs/BoqRevisionHistory.tsx`

- Props: `currentBoq: BoqRecord`.
- On mount, resolves the OA family root (same query as `loadFamilyFor`) and fetches all sibling BOQs ordered by `revision asc`.
- Renders a compact table with the columns above and a `View` link per row.
- The currently open BOQ row is highlighted and labeled "Viewing".

### 4. Read-only marker on superseded BOQ in editor

- In `BoqEditor.tsx`, if the loaded BOQ has `is_current === false`, show a small alert at the top: *"Viewing superseded revision Rn (read-only). Open the current revision to edit."* with a link to the current sibling. No change to existing save/edit gating logic — this is purely a label.

## What is NOT changed

- No DB migration, no schema change, no deletion of old revisions.
- No change to `boq_revisions` snapshot table, design-review history, OA/PI sync, calc, permissions, or saved-snapshot logic.
- "Save to BOQ Folder" behavior unchanged.
- Toggle still available — only the default flips.

## Technical notes

- The `boqs` table already has `is_current`, `revision`, `revised_from_id`, `source_order_id`, and the OA family is reachable via `orders.parent_order_id`. All needed data is already available client-side.
- Numeric sort uses the numeric `revision` column, not the string `boq_number`, so `R10` ordering is automatically correct.

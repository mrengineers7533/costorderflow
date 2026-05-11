## Diagnosis

I checked the database for the OA you're viewing (`/orders/41de2f76…`):

- The cost sheet HAS been re-parsed and now contains the verbatim Make values like `"M.R.Engg (Fowler Westrup)"` and `"M.R. Engg"` for every item.
- **But the OA's own `line_items` still have `make_label: null`** because the OA was saved before re-parsing, and you haven't re-applied the cost sheet to push the new Make values into this OA.

So the Make input column in the editor renders empty (placeholder "Make") and the OA preview / PDF / Excel show empty Make cells.

The previous fix added a **Re-parse → Apply** flow, but Apply overwrites the entire item list, which loses any manual edits and feels heavy. We need an automatic, non-destructive backfill.

## Fix (frontend only — zero calculation changes)

### 1. Auto-backfill `make_label` on OA load

`src/pages/orders/OrderEditor.tsx`
- After loading the OA, if any item has empty `make_label` AND the OA has a `cost_sheet_number`, fetch that cost sheet's `extracted.line_items` once and merge `make_label` into local state by matching on `description` (case-insensitive, trimmed) — falling back to row index when descriptions are duplicated.
- This is read-only state hydration. It does NOT modify quantity, rate, amount, charges, totals, GST, format split, or anything else. It does NOT auto-save — the user sees Make populated immediately, and the values persist the next time they hit "Save".
- If no matching cost sheet row is found for an item, leave `make_label` empty and the existing `displayMake()` fallback (`"M.R. Engineers"` / `"GMS"`) takes over in preview / PDF / Excel.

### 2. Show fallback in the editor input itself

`src/pages/orders/OrderEditor.tsx`
- Today the Make `<Input>` binds raw to `it.make_label` and shows blank when null.
- Change it to show `displayMake(it)` as the displayed value when `make_label` is empty (rendered through a small wrapper: keep the underlying `make_label` in state, but display the friendly fallback as ghost/value when empty).
- Simplest implementation: bind the input to `it.make_label ?? ""` but set the input's `placeholder` to `displayMake(it)` so the user sees "M.R. Engineers" / "GMS" hint instead of the literal word "Make".
- Editing still writes to `make_label` directly. No calculation impact.

### 3. (No changes) Preview / PDF / Excel already use `displayMake`

Verified `OrderPreview.tsx`, `pdf.ts`, `excel.ts`, `clientCopyExcel.ts` already render via `displayMake()`. Once step 1 hydrates `make_label`, every Make column will show the verbatim cost-sheet value automatically.

## What is NOT changed

- No DB schema, no migration.
- No change to amount / qty / unit / rate / PF / freight / insurance / custom / clearing / GST / discount / advance / totals / formulas.
- No change to BOQ, PI, Cost Order Flow, or workflow.
- No change to the MR/GMS routing enum or OA-format split.
- HSN field stays in the data model (used by search & inference); it is just not displayed in the OA item table.
- Existing `Re-parse` / `Apply` buttons stay as-is for the cases where you want to re-pull headers, charges, etc.

## Result

Open the OA at `/orders/41de2f76…` → the Make column instantly shows `"M.R.Engg (Fowler Westrup)"`, `"M.R. Engg"`, `"GMS (Ugur)"`, etc. for each row, exactly as printed in the cost sheet PDF. Hit Save when convenient to persist. No numbers move.

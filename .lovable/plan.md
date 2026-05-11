## Diagnosis

The HSN→Make column swap is already in place (editor, preview, PDF, Excel). The reason **no Make value is appearing** for items is:

1. The cost sheet for the OA you're editing was parsed **before** the AI prompt was updated to capture `make_label`. The stored `extracted` JSON has `make: "MR"|"GMS"|"OTHER"` (the routing enum) but **no `make_label` string**. Verified in DB — every row's `make_labels` array is empty.
2. Existing OA records saved their line items without `make_label` (the field didn't exist yet).

So the column is empty for everything that was parsed/saved before this change. New uploads from this point forward will have it, but old data needs a path to backfill.

## Fix

### 1. Force re-parse for already-parsed cost sheets
`src/components/orders/CostSheetPicker.tsx`
- Add a small **Re-parse** button next to the existing **Apply** button for sheets in `parsed` state. It calls the same `parseSheet(id)` flow, which will re-invoke `parse-cost-sheet` and overwrite `extracted` with the new schema (now including `make_label`).
- After re-parse completes, the user clicks **Apply** to push the refreshed items (with Make values) into the OA editor.

### 2. Display fallback for items that still have no `make_label`
For OAs whose cost sheet was never re-parsed (or items entered manually), show a sensible default derived from the existing `make` enum so the column isn't blank:
- `make_label` set → use it verbatim
- else if `make === "MR"` → "M.R. Engineers"
- else if `make === "GMS"` → "GMS"
- else → "" (blank)

Centralize this in a tiny helper `displayMake(item)` in `src/lib/orders/calc.ts` and use it in:
- `src/components/orders/OrderPreview.tsx` (Make cell)
- `src/lib/orders/pdf.ts` (MR + GMS row builder)
- `src/lib/orders/excel.ts` and `src/lib/orders/clientCopyExcel.ts`

The editor input still binds directly to `make_label` (raw, editable).

### 3. AI prompt tightening (small)
`supabase/functions/parse-cost-sheet/index.ts`
- Reinforce the rule so the model always returns `make_label` when a Make column is present in the detail table — including phrasing like "GMS (Ugur)", "M.R. Engg. (Halmark)". Today's prompt mentions it but list it as a hard requirement alongside `description` / `quantity`.

## What this does NOT change

- No DB schema change.
- No calculation, total, GST, BOQ, PI, template, layout, or workflow change.
- The MR/GMS routing enum (`make`) and the OA-format split are untouched.
- Existing `hsn_code` data stays in the DB but is not displayed in the OA item table (already done).

## User-facing flow after this change

1. Open the OA → click **Re-parse** on the cost sheet card → wait for parse → click **Apply**. Make column now shows "GMS (Ugur)", "M.R. Engg. (Halmark)" etc. for every item, exactly as in the PDF.
2. Newly uploaded cost sheets get Make automatically without any extra step.
3. OAs that never re-parse still show a sensible "M.R. Engineers" / "GMS" fallback per item instead of a blank column.
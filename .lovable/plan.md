# Fix: RM Master → Requisition auto-populates Size/Model and Qty/unit

## Root cause

The Requisition dialog (`CreateRequisitionDialog.tsx`) already reads `size_model` and `qty_per_unit` straight from the `fg_raw_material_map` row — that code is correct.

The data in `fg_raw_material_map.raw_materials` is itself wrong: a database sample shows almost every row stored as `qty_per_unit: 0` and `size_model` missing. So nothing in the requisition flow needs to change — the bug is in the RM Master Excel parser (`src/pages/RawMaterialMaster.tsx → parseSheet`).

Two parser problems explain the symptoms:

1. **Qty column picked is wrong.** Header detection is `headers.findIndex(h => h.includes("reqd") || h.includes("qty"))`. The user's sheet has both `Qty / unit` and `Reqd`, and `Qty / unit` appears first, so the parser locks onto `Qty / unit`. In the source workbook that column is blank for most rows while the real quantity lives in `Reqd` (or vice-versa), so every row gets `0`.
2. **Size / Model lost when cell is blank in a merged block.** When the Excel uses merged cells for Size that span sibling rows of the same FG, only the first row carries a value; the rest become `undefined`. That matches the DB pattern (one row has `size_model: "1"`, the rest are missing).

## What to change (scope: parser only)

Single file: `src/pages/RawMaterialMaster.tsx`, inside `parseSheet`. No requisition, no UI, no schema changes.

1. Detect two distinct columns instead of one:
   - `cQtyPerUnit` = header containing `qty` (e.g. `qty / unit`, `qty/unit`, `qty per unit`).
   - `cReqd` = header containing `reqd` (e.g. `reqd`, `reqd qty`, `required`).
   - Keep current behaviour when only one of them exists.
2. When building each RM row, set `qty_per_unit` to the first non-empty, non-zero value among `[row[cQtyPerUnit], row[cReqd]]`. If both are empty, fall back to `0` (today's behaviour).
3. For `size_model`, when the current row's Size cell is empty, carry forward the last non-empty Size value seen within the same FG block (Column A unchanged). Reset the carry-forward when a new FG starts. This mirrors how Excel merged cells read out as blanks on subsequent rows.
4. No change to Make, Material, Unit, Notes parsing, FG grouping, or dedupe logic.

## Re-populating existing data

The DB rows are already wrong, so a code fix alone won't update them. After deploying the parser change, the admin must re-upload the same RM Master Excel from the `Raw Material Master` page — the existing `upsert(..., onConflict: "model_number")` path will overwrite each FG's `raw_materials` with the corrected values. No migration needed.

## Verification

1. Upload the existing RM Master Excel from `Raw Material Master`.
2. Open any FG in the master detail dialog — Size / Model and Qty / unit columns are now populated.
3. In Manufacturing → BOQ → Create Requisition → Manual select, click `Search RM Master` and pick the FG. The RM rows show Material, Size / Model, Qty / unit, Unit all auto-filled; `Reqd` column recomputes correctly.
4. Direct Purchase FGs still mark as Direct Purchase (no rows). Existing RM rows for FGs not re-uploaded remain unchanged.
5. No change to BOQ, OA, PI, PDFs, calculations, notifications, or any other module.

## Out of scope (explicitly unchanged)

- `CreateRequisitionDialog.tsx`, requisition save/edge function, PDF, public requisition view.
- DB schema, RLS, edge functions.
- Direct Purchase flow, Make column toggle, Load-from-RM-Master button behaviour beyond reading the now-correct data.

## Goal

Replace the **HSN** column with **Make** in the OA item table everywhere it's shown to the user (editor, on-screen preview, PDF, Excel, client copy). Carry the literal Make string from the Cost Sheet PDF (e.g. `M.R. Engineers`, `GMS (Ugur)`, `M.R. Engg. (Halmark)`) into each line item.

No changes to BOQ, PI, calculations, totals, charges, templates outside the items table, DB schema, search, or revisions logic.

## Scope of changes

### 1. AI extraction — capture the raw Make string
`supabase/functions/parse-cost-sheet/index.ts`
- Add a new schema field `make_label: { type: "string" }` on each line item (alongside the existing `make` enum and `hsn_code`).
- Update the system prompt: extract the **verbatim** "Make" cell from the cost sheet detail table into `make_label` (e.g. "M.R. Engineers", "GMS (Ugur)", "M.R. Engg. (Halmark)"). The existing `make` MR/GMS/OTHER enum stays — it still drives MR-vs-GMS OA splitting.
- Stop appending `(M.R.Engg / Fowler Westrup)` etc. to the description (rule 3 in the prompt) since Make now has its own column.

### 2. Type — add `make_label` to `LineItem`
`src/lib/orders/types.ts`
- Add `make_label?: string` to `LineItem`. Keep `hsn_code?: string` untouched (revisions/search still read it; it just won't be displayed in the OA item table).

### 3. Carry `make_label` through extraction → editor
- `src/components/orders/CostSheetPicker.tsx` — add `make_label?: string` to the `ExtractedCostSheet.line_items` shape.
- `src/components/orders/QuickOrderPanel.tsx` — copy `make_label` when mapping extracted items into `LineItem`s.
- `src/pages/orders/OrderEditor.tsx` — when seeding from `extracted` (around line 470) include `make_label: it.make_label || ""`. New blank rows (line 90) default `make_label: ""`.

### 4. Editor item table (replace HSN cell)
`src/pages/orders/OrderEditor.tsx`
- Header `<div className="col-span-2">HSN</div>` → `Make`.
- Input bound to `it.hsn_code` → bound to `it.make_label`, placeholder `"Make"`.
- Leaves all other columns (Description / Qty / Unit / Rate / Amount / Make-classification dropdown) untouched.

### 5. On-screen preview (replace HSN column)
`src/components/orders/OrderPreview.tsx`
- Header cell currently rendering `"HSN CODE" / "HSN Code"` → `"Make"`.
- Body cell `it.hsn_code` → `it.make_label || ""`.

### 6. PDF (MR + GMS templates)
`src/lib/orders/pdf.ts`
- MR table (line 310): header `"HSN Code"` → `"Make"`; row value `it.hsn_code` → `it.make_label || ""`. Widen column slightly (e.g. `cellWidth: 28`) to fit longer Make strings; reduce description's `auto` accordingly via no change (auto absorbs the difference).
- GMS table (lines 568, 572, 696): header `"HSN CODE"` → `"MAKE"`; row value `it.hsn_code` → `it.make_label || ""`; bump column width (e.g. `cellWidth: 30`).
- No change to totals rows, calculations, header/footer artwork, or any other field.

### 7. Excel exports
- `src/lib/orders/excel.ts` — header `"HSN/Model"` → `"Make"`; row `it.hsn_code` → `it.make_label || ""`.
- `src/lib/orders/clientCopyExcel.ts` — header `"HSN"` → `"Make"`; row `it.hsn_code` → `it.make_label || ""`.

## Out of scope (explicitly unchanged)

- `supabase/functions/parse-cost-sheet` still extracts `hsn_code` and the `make` MR/GMS/OTHER enum — both are still needed by revisions, search, and OA splitting.
- `src/lib/orders/calc.ts` `inferItemMake` / `detectFormat` keep using description + `hsn_code`. No formula or totals change.
- `src/lib/orders/pdf.ts` totals block, charges, GST, advance, Turkey/Murthal logic — untouched.
- `src/lib/revisions/index.ts`, `src/components/GlobalSearch.tsx`, `src/lib/pi/*`, `src/lib/boq/*`, `src/pages/pi/PiEditor.tsx`, `src/pages/boqs/BoqEditor.tsx` — untouched (HSN/model usage there is intentional).
- DB schema unchanged (line items live in `orders.line_items` JSONB; new `make_label` slots in without migration).
- For OAs created before this change, the Make column simply renders blank since `make_label` wasn't captured — no backfill.

## Result

OA item table everywhere reads:

```text
S.No | Description | Make | Qty | Unit | Rate | Amount
```

with `Make` populated per item from the uploaded Cost Sheet (e.g. `M.R. Engineers`, `GMS (Ugur)`, `M.R. Engg. (Halmark)`).

# Cost Sheet — Motor fields + History

Only additive changes. OA/quotation PDF, calculations, item selection, sections, totals, existing flows untouched.

## 1. AI extraction (parse-cost-sheet)

`supabase/functions/parse-cost-sheet/index.ts`
- Extend the system prompt to describe the new landscape layout: after Price/Amount the detail table may contain `Motor`, `Motor Qty`, `Motor Price`, `Remarks`. Extract verbatim; if not present, omit.
- Add to the `extract_cost_sheet` tool schema on each line item:
  - `motor` (string) — model/spec text as printed
  - `motor_quantity` (number)
  - `motor_price` (number)
  - `remarks` (string) — **reuse existing `remarks` field on `LineItem`; do not duplicate**
- Old portrait sheets keep working — all four fields are optional.

## 2. Types & item mapping

`src/lib/orders/types.ts` — add optional fields on `LineItem`:
```ts
motor?: string;
motor_quantity?: number;
motor_price?: number;
// remarks?: string  — already exists, reused
```

Wherever extracted cost-sheet payloads are mapped into `LineItem` (OrderEditor + CostSheetPicker `ExtractedCostSheet.line_items`), pass through the four new fields. No effect on `amount`, `unit_rate`, totals, or PDF.

## 3. OA editor — optional hidden columns

`src/pages/orders/OrderEditor.tsx` (+ `pdfColumns.ts` only if needed for the in-editor column toggle, NOT for the PDF):
- Add four columns to the OA items table: **Motor**, **Motor Qty**, **Motor Price**, **Remarks**. Hidden by default behind the existing column-visibility toggle.
- Editable inline; values persist on `line_items`.
- `Remarks` column binds to the existing `remarks` field — no new field.
- **No change** to `src/lib/orders/pdf.ts`, PDF column set, totals, calc.ts, preview math.

## 4. Cost Sheets history — dedicated page + picker polish

New sidebar entry **Cost Sheets** → `/cost-sheets` (icon `FileText`), gated by `RequireModule` with new module key `cost_sheets` in `src/lib/access/modules.ts`.

New `src/pages/cost-sheets/CostSheetsList.tsx`:
- Table of all rows from `cost_sheets` (existing table, no schema change).
- Columns: file name, uploader, uploaded at, status, parsed cost-sheet number, linked OAs (MR/GMS if any), actions.
- Actions per row: **View PDF** (signed URL in new tab), **Download**, **Re-parse**, **Delete** (admin or owner).
- Search by filename / cost-sheet number / company; filter by status.
- Reuses existing `cost-sheets` storage bucket and current RLS.

Enhance `src/components/orders/CostSheetPicker.tsx`:
- Add explicit **View** and **Download** buttons next to each row (currently only Parse/Apply/Delete exist). Uses `createSignedUrl` on the existing bucket.

Route wired in `src/App.tsx` inside the authenticated layout.

## 5. Existing cost sheets

The Re-parse button already exists in the picker and will be added to the new history page, so older sheets can be re-parsed on demand to fill motor fields. No automatic backfill.

## Out of scope (explicitly unchanged)

- `src/lib/orders/pdf.ts`, `pdfColumns.ts` PDF column set, quotation PDF, BOQ/PR/PO/GRN, requisition flow.
- `src/lib/orders/calc.ts` totals, charges, GST, freight, MR/GMS split.
- `cost_sheets` table schema, RLS, storage bucket.
- `parse-cost-sheet` rate limiting, auth, model selection.

## Verification

1. Upload a new landscape PDF with motor columns → parse → open OA editor → enable Motor/Motor Qty/Motor Price/Remarks columns → values are filled. Generate OA PDF → identical to today (no motor columns shown).
2. Upload an old portrait PDF → parses as before, motor fields blank, no regressions.
3. `/cost-sheets` lists every uploaded sheet; View opens PDF, Download saves it, Re-parse refreshes extraction, Delete removes file+row.
4. Sidebar shows Cost Sheets entry only for users with module access.

# Fix Motor / Motor Qty / Motor Price / Remarks mapping

The new columns render in the OA item table, but values are blank because the data does not survive the full pipeline from AI extraction → OA editor state → DB → Auto-BOQ. The fixes below close every gap without touching OA / PI / Quotation PDFs, calculations, or pricing logic.

## What I will change

### 1. Verify and harden the AI extraction (`supabase/functions/parse-cost-sheet/index.ts`)
- Strengthen the system prompt: explicitly require `motor`, `motor_quantity`, `motor_price`, `remarks` on **every** line item when the landscape table has those columns, with a concrete worked example so Gemini never silently drops them.
- Coerce numeric fields server-side: parse `motor_price` / `motor_quantity` from strings like `"₹ 12,345"` and `"2 Nos"`; fall back to `undefined` only when the cell is truly blank.
- Add a console log of the per-item motor field presence (count of items with motor data) so we can see in edge-function logs whether the PDF in question actually has motor columns.
- Re-deploy `parse-cost-sheet`.

### 2. Apply-mapping in OA Editor (`src/pages/orders/OrderEditor.tsx`)
The current mapping reads `ext.motor`, `ext.motor_quantity`, `ext.motor_price`, `ext.remarks` — this is correct but fragile. I will:
- Pass through `motor_quantity` / `motor_price` as `Number(...)` only when the value is `> 0`; otherwise keep `undefined` so the input shows the placeholder instead of `0`.
- Also accept alternate keys the AI sometimes emits (`motorQty`, `motor_qty`, `motorPrice`) defensively.
- Ensure `remarks` from the cost sheet is **not** wiped by the existing `remarks: prev?.remarks || ""` carry-over logic when a new OA is created (only the apply path is affected; revision carry-over stays untouched).

### 3. Persist on save (no schema change needed)
`orders.line_items` is already `jsonb`, so motor fields ride along automatically. I will verify by reading one saved row after the fix and confirming the keys persist; no migration required.

### 4. Auto-BOQ propagation (`src/lib/revisions/index.ts` + `src/lib/boq/types.ts`)
- Extend `BoqLineItem` with optional `motor?: string`, `motor_quantity?: number`, `motor_price?: number`.
- In `reviseBoqFromOrder`, `syncBoqsAndPisForOrder` and `createPendingBoqRevision`, copy `motor`, `motor_quantity`, `motor_price`, and `remarks` from each OA line item onto the BOQ line item (preserving previous values when the OA field is blank, same pattern as existing `remarks`).
- The initial BOQ auto-created on OA save will therefore include these fields automatically.

### 5. BOQ PDF columns (`src/lib/boq/pdf.ts`)
- Add four new optional columns — **Motor / Motor Qty / Motor Price / Remarks** — to the BOQ PDF, appended **after** existing columns so layout and column widths of the existing BOQ are not disturbed.
- Columns auto-hide when **no** row in the BOQ has any motor/remarks data, so legacy BOQs render identically to today.
- BOQ Excel export (`src/lib/boq/excel.ts`) gets the same four optional columns under the same auto-hide rule.

### 6. BOQ editor display (`src/pages/boqs/BoqEditor.tsx`)
- Show the four new columns as read-only in the BOQ item table (already-edited Remarks stays editable as it is today). Hidden behind the existing column-visibility toggle if one exists; otherwise appended after Remarks.

### 7. Re-parse hint for already-uploaded sheets
- In the Cost Sheets history page, surface a small "Re-parse to pull Motor fields" hint on any sheet whose `extracted.line_items` contains zero motor data. The Re-parse button already exists — this just makes the action discoverable for sheets parsed before the prompt fix.

## What stays untouched
- OA PDF (`src/lib/orders/pdf.ts`), OA PDF column visibility, quotation PDF, PI PDF, PO PDF, GRN
- `calc.ts` (totals, EXW Murthal/Turkey, advance, GST, all pricing logic)
- Item selection, splitting by MR/GMS, revision/audit flows
- `cost_sheets` table schema, RLS, storage bucket, rate limiting
- Existing BOQ layout when no motor data is present (columns auto-hide)

## Verification I will run after build
1. Re-parse one landscape cost sheet → confirm `cost_sheets.extracted.line_items[*]` contains `motor`, `motor_quantity`, `motor_price`, `remarks` (read via DB query).
2. Apply → confirm the four columns in OA editor populate with real values (not placeholders).
3. Save the OA → confirm `orders.line_items` JSON has the fields.
4. Open the auto-created BOQ → confirm the four columns show the same values, and the BOQ PDF renders them after existing columns.
5. Re-render the OA PDF and confirm it is byte-identical in layout to before (no new columns, no totals change).

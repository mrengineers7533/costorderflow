## Goal

Make Motor and Motor Qty proper columns in the BOQ Items table (between MAKE and QTY), default the "Show Motor Details" toggle to ON, ensure values persist to `boqs.line_items` on every save, and honor the toggle uniformly on PDF, distribution PDF, and the approver/verify page.

Out of scope: OA PDF, PI PDF, Quotation PDF, PO/GRN, pricing/calculations, item selection, cost-sheet schema.

## Changes

### 1. `src/pages/boqs/BoqEditor.tsx` — Items table as real columns
- Replace the inline Motor note (≈ lines 769–778) with two real grid columns inserted between MAKE and QTY.
- Update the items list grid template + header row to include `MOTOR` and `MOTOR QTY` headers when `showMotor` is true. Render for every row (empty cell when row has no motor data). No truncation/inline note.
- Header helper text: change "Hidden by default" → "Visible by default. Toggle persists per BOQ".
- `setShowMotor` default stays `true`; ensure load path also defaults to `true` when `b.show_motor` is `null/undefined` (already the case at line 199).
- Save path (`buildRecord` / handlers around lines 289 & 391) already writes `show_motor` and `line_items` (which include `motor`, `motor_quantity`). Verify the line-item serializer preserves `motor` and `motor_quantity` fields on every save — add explicit pick if currently filtered.

### 2. `src/pages/boqs/BoqEditor.tsx` → `BoqDocPreview` — on-screen preview
Already renders columns when `hasMotor`. Keep as-is. Just match new "always show columns when toggle on" rule: change `hasMotor` to `showMotor` (do not gate on row data presence) so empty cells render instead of hiding columns.

### 3. `src/lib/boq/pdf.ts` — Generated BOQ PDF
- Change `hasMotor = showMotor && hasMotorData` to `hasMotor = showMotor` (default ON). Columns appear whenever toggle on; empty string for rows without motor data.
- Keep Motor Price column removed.

### 4. `src/lib/boq/excel.ts` — Excel export
- Same change: gate columns on `showMotor` only, not on row data presence.

### 5. `src/lib/boq/pdfDistribution.ts` & `src/components/boqs/DistributeBoqDialog.tsx`
- Verify distribution PDF passes `showMotor: boq.show_motor ?? true` through to `generateBoqPDF`. If currently passing the local dialog switch state, persist that to `boqs.show_motor` before generating the link, so approver page and "always-latest" PDF stay in sync.

### 6. `src/pages/boqs/BoqVerify.tsx` — Approver / verify page
- Render Motor and Motor Qty as real columns (not inline note) between MAKE and QTY when `show_motor` from RPC is true.
- Keep the approver's "Show Motor Details in BOQ" switch; its final value is sent via `verify_boq_items_with_token(..., _show_motor)` (already wired in the RPC).

### 7. Database
No schema migration needed. `boqs.show_motor` already exists (default `true`) and `verify_boq_items_with_token` already accepts `_show_motor`. `line_items` JSON already carries `motor` / `motor_quantity` from OA → BOQ generation.

### 8. QA
- Open existing BOQ → Motor + Motor Qty columns visible by default; toggle hides both.
- Save BOQ → reload → toggle state + motor values persist.
- Generate BOQ PDF & Excel → columns match on-screen toggle, no Motor Price column.
- Generate distribution link → approver page shows same columns; approver toggling and submitting persists `show_motor` back to BOQ row.
- OA editor / OA PDF / PI PDF / Quotation PDF unchanged.

## Technical notes

- File touch list: `src/pages/boqs/BoqEditor.tsx`, `src/lib/boq/pdf.ts`, `src/lib/boq/excel.ts`, `src/lib/boq/pdfDistribution.ts`, `src/components/boqs/DistributeBoqDialog.tsx`, `src/pages/boqs/BoqVerify.tsx`.
- No new dependencies. No migration. No edge-function changes.

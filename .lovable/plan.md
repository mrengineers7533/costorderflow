## Plan: make exported OA/PI PDFs match Live Preview exactly

### Goal
Fix the recurring exported PDF alignment/wrapping problem for MR and GMS templates without changing calculations, numbering, approval logic, workflows, or stored data.

### Root-cause direction
The app currently has two PDF paths:
- **Live Preview capture path** in `src/lib/orders/previewPdf.ts`
- **Legacy jsPDF/autoTable path** in `src/lib/orders/pdf.ts`, still used by PI and fallback downloads

Because these paths render tables differently, fixes applied to one path can still leave exported PDFs misaligned in another path.

### Implementation steps
1. **Make OA and PI downloads use the Live Preview as the primary export source**
   - Keep the same preview UI.
   - Export the exact rendered preview DOM wherever possible.
   - Apply this to both OA and PI download buttons.

2. **Fix the preview-capture layout, not business logic**
   - Stabilize item table widths for MR and GMS.
   - Ensure hidden columns are fully removed and remaining columns reflow.
   - Ensure header/small columns stay center-aligned.
   - Ensure description wraps cleanly and stays vertically centered.
   - Ensure rate/amount stay right-aligned and do not drift outside borders.

3. **Improve PDF page slicing**
   - Prevent rows, terms blocks, totals rows, and signature/footer sections from being cut mid-section.
   - Keep page size and margins professional and consistent.

4. **Keep legacy renderer only as a fallback**
   - Do not remove existing `generateOrderPDF` logic.
   - If preview capture is unavailable, fallback remains.
   - But normal user-initiated OA/PI exports should come from the same Live Preview layout.

5. **Visual QA before completion**
   - Export a GMS PDF from the current order page.
   - Convert the generated PDF pages to images.
   - Inspect alignment, wrapping, row heights, column borders, totals, and page breaks.
   - Repeat for MR if available from the same flow or a known MR record.
   - Report any issues found and how they were fixed.

### Files likely changed
- `src/lib/orders/previewPdf.ts`
- `src/styles/oa-pdf.css`
- `src/pages/pi/PiEditor.tsx`
- Possibly small scoped changes in `src/components/orders/OrderPreview.tsx`

### What will not change
- No calculation changes
- No approval/workflow changes
- No database changes
- No numbering changes
- No BOQ/Purchase/Manufacturing logic changes
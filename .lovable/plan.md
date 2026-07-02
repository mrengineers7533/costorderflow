I agree with you. The failure is that the PDF work drifted into repeated CSS/display patches instead of locking the MR and GMS exports to the original template structure you provided. The next fix should be template-format based, not another small alignment tweak.

## Plan

1. **Re-check the original MR and GMS samples**
   - Use the uploaded MR/GMS sample PDFs as the source of truth.
   - Compare them against the current Live Preview and exported PDFs for:
     - Header/logo position
     - Title bar spacing
     - Item table column widths
     - Row height and vertical centering
     - Wrapped description behavior
     - Totals alignment
     - Terms/bank/signature/footer placement
     - Page break behavior

2. **Fix the shared OA/PI PDF structure, not business data**
   - Work only in OA/PI preview/export layout files.
   - Do not touch calculations, numbering, approval logic, BOQ, workflow, database rules, or saved order data.
   - Keep the existing MR/GMS format selection and hidden-column behavior.

3. **Create stable MR and GMS table layout rules**
   - Define fixed professional column proportions per template.
   - Hidden columns will be fully removed, then remaining columns will reflow predictably.
   - Description stays left-aligned and vertically centered.
   - Item No, Make, Qty, Unit stay centered.
   - Rate/Amount stay right-aligned.
   - Long text wraps inside cells only; it must not cross borders.

4. **Replace fragile vertical-centering behavior**
   - Remove any ineffective centering tricks that do not work reliably in html2canvas/PDF capture.
   - Use a more reliable table-cell layout so every cell’s content centers vertically against multi-line descriptions.
   - Ensure row height grows automatically with wrapped descriptions.

5. **Fix pagination properly**
   - Prevent table rows, totals, terms blocks, bank/signature blocks, and headers from being sliced incorrectly.
   - Allow the export to add pages automatically as needed.
   - Repeat/retain enough header structure on new pages where appropriate.

6. **Keep Live Preview and PDF identical**
   - The PDF export should capture the same DOM/layout as Live Preview.
   - Any PDF-only rules should only correct browser/PDF rendering differences, not change the visible format.

7. **Add visual QA before completion**
   - Export/check both formats:
     - GMS sample-style order
     - MR sample-style order
     - Long wrapped descriptions
     - Hidden 0/1/2 columns
     - Multi-page item list
   - Convert generated PDFs to images and inspect alignment, wrapping, and page breaks before saying fixed.

## Files expected to change

- `src/components/orders/OrderPreview.tsx`
- `src/styles/oa-pdf.css`
- `src/lib/orders/previewPdf.ts` only if pagination slicing needs adjustment

## What will not change

- No data changes
- No approval/workflow changes
- No calculation/formula changes
- No database changes
- No BOQ/Purchase/Manufacturing logic changes

## Completion proof I will provide

- What was wrong
- What files changed
- GMS PDF visual QA result
- MR PDF visual QA result
- Multi-page/page-break QA result
- Hidden-column QA result
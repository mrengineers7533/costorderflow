# Move PI Live Preview to Bottom (match OA/BOQ pattern)

## Problem
On the PI editor (`/pi/:id`), the live preview currently sits in a sticky **right-hand column** of a 2-column grid. The OA editor (and BOQ) instead show all editing sections stacked first, then a **full-width "Review & Export" preview section at the bottom** under a top border. The user wants PI to follow the same layout.

## Changes

### `src/pages/pi/PiEditor.tsx`
1. Remove the `lg:grid-cols-2` wrapper that splits inputs (left) and preview (right).
2. Stack all the existing edit cards (PI details, Line items, PI adjustments, Revision history) in a single full-width column.
3. After those cards, add a `<section id="preview" className="space-y-3 pt-6 border-t">` containing:
   - A heading row: "Review & Export" with subtitle "Scroll through the preview below. When everything looks correct, export the PI PDF."
   - The existing `<OrderPreview …/>` (same props, full width — no sticky/side column).
   - The existing italic note explaining the title swap to PROFORMA INVOICE and the extra Discount/Advance/Net Payable rows.
   - A right-aligned "Export PI PDF" button (mirrors OA's bottom export button) calling `downloadPdf`.
4. Keep the top header bar (back button, PI number, format chip, R-badge, "PI PDF" and "Save as new revision" buttons) unchanged.
5. Keep the existing "scroll to preview" behavior available — the section keeps `id="preview"` so the top "PI PDF" button area can later get a "Jump to preview" link if desired (optional, not required).

### Resulting layout
```text
┌──────────────────────────────────────────────┐
│ Header (PI number, format, revision, actions)│
├──────────────────────────────────────────────┤
│ PI details                                   │
├──────────────────────────────────────────────┤
│ Line items                                   │
├──────────────────────────────────────────────┤
│ PI adjustments + totals                      │
├──────────────────────────────────────────────┤
│ Revision history                             │
├──────────────────────────────────────────────┤  ← border-t
│ Review & Export                              │
│ [ full-width OrderPreview ]                  │
│                          [ Export PI PDF ]   │
└──────────────────────────────────────────────┘
```

## Out of scope
- No changes to PI calculation, PDF rendering, revisions, schema, or routing.
- No changes to OA, BOQ, sidebar, or theme.

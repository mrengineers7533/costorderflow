## Goal
Restructure the OrderEditor so the **Live Preview appears at the bottom** (after all form sections are filled), followed by the **Export PDF** button. This enforces a "fill → review preview → export" flow instead of the current always-visible side panel + top-right PDF button.

## Current behavior
- `OrderEditor.tsx` uses a 2-column grid: form on the left, **sticky preview on the right** (`aside` at lines 523–548).
- A "PDF" / "Download both PDFs" button sits in the **top-right header** (lines 247–254), available even when the form is empty.

## Proposed changes (single file: `src/pages/orders/OrderEditor.tsx`)

### 1. Remove the side preview
- Drop the `lg:grid-cols-[minmax(0,1fr)_380px]` 2-column layout.
- Render the entire form as a single full-width column.
- Delete the right `<aside>` block (lines 523–548).

### 2. Move preview to the end
- After the last form Card (Terms / Bank / GMS Terms), render a new section:
  - **Heading**: "Review & Export" with helper text "Scroll through the preview below. When everything looks correct, export the PDF."
  - The full `<OrderPreview>` component, rendered inline (not sticky), full width.
  - A clear primary **Export PDF** button directly **below** the preview (large, full-width on mobile, right-aligned on desktop), label switching to "Download both PDFs (MR + GMS)" in split mode.

### 3. Header cleanup
- Remove the small "PDF" button from the top-right header (keep Back / Save Draft / Finalize).
- Optionally keep a secondary "Jump to Preview" anchor link in the header that scrolls to the preview section (smooth scroll via `#preview` id).

### 4. Gating (light-touch)
- The Export PDF button stays enabled but shows a subtle inline warning above it if **no items have a description** OR **company name is empty**, e.g. "Add at least one item and a customer name before exporting." It does not hard-block — matches the user's existing flexible workflow.

### 5. No changes to
- `OrderPreview.tsx` internals
- PDF generation logic (`downloadPDF`, templates)
- Split-mode behavior (still produces 2 PDFs)
- Save / Finalize flow
- Database schema

## Acceptance criteria
- Opening `/orders/new` shows only the form (no side preview).
- Scrolling to the bottom reveals the full preview, followed by a prominent Export PDF button.
- Header no longer has a PDF button; Save Draft and Finalize remain.
- In split mode, the bottom button reads "Download both PDFs (MR + GMS)" and produces both files.
- Empty-form warning appears above the export button when description/company are missing, but does not block clicking.

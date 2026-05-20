## Goal

On the OA editor, show each item's Design Team approval status (Pending / Approved / Rejected) next to Model and Remarks. The status is pulled from the linked current BOQ's per-item `approval_status` — which is already synced from the latest design-review round and propagated across all BOQ revisions for the OA family.

No existing logic for OA save, BOQ sync, revise, or PDF rendering is changed.

## Changes

### 1. `src/pages/orders/OrderEditor.tsx` — display the column

- Extend the existing "Show/hide Model & Remarks" toggle to also include the new column. Rename the button to "Show/hide Model, Remarks & Approval".
- When `showItemExtras` is true, add a new `col-span-2` header **"Approved by Design"** after Remarks. Bump the grid column count from `18 → 20`.
- For each OA row, render a read-only badge derived from the matching BOQ item's `approval_status`:
  - `approved` → green "Approved"
  - `rejected` → red "Rejected"
  - anything else (or unmatched) → amber "Pending"
- Matching uses `currentBoq.line_items` already loaded in state. Build a normalized-description map (same convention used elsewhere: trim + lowercase + collapsed whitespace) with a positional fallback when descriptions collide or are blank. Helper goes in the same file (no new module needed).
- Column is read-only — no inputs, no handlers, no OA data writes.

### 2. BOQ revise / auto-sync — no changes needed

`src/lib/revisions/index.ts` already preserves `approval_status` per item across BOQ revisions via `prev?.approval_status` (and resets only when a review round is open). When the OA is revised → BOQ auto-revises, the previously-approved items remain Approved; brand-new items default to Pending. The OA column will reflect this on next render.

### 3. BOQ PDF — no changes needed

`src/lib/boq/pdf.ts` already renders an "Approved by Design" column from each line item's `approval_status` with the same Approved / Pending / Rejected coloring for both MR and GMS formats.

## Out of scope

- Editing approval status from the OA (read-only mirror).
- Schema / RPC / migration changes.
- Any change to OA PDF, OA save flow, BOQ editor logic, or design-review sync.

# Per-item Remarks + Attachments for the OA/BOQ creator

Goal: the OA/BOQ creator can add/edit Remarks and attach files per line item BOTH on the BOQ editor and inside the "Generate Design Link" panel — without touching any other existing behavior.

## Scope (only what changes)

### 1. BOQ editor — `src/pages/boqs/BoqEditor.tsx`
- Remarks editing for the creator is currently gated by `canEditRemarks && !locked`. Keep `locked` as is (approved / final_sent stays read-only) but make sure the **Remarks textarea and "Save Remarks" button are enabled in every other state**, including `design_sent` (link generated, awaiting review) — which is the state where the user reports being unable to edit.
- Per-item attachment popover (`BoqItemAttachments`) already renders on each row — leave it untouched.
- No other column behavior, save flow, or design-review logic changes.

### 2. Link-generation panel — `src/components/boqs/DesignReviewPanel.tsx`
- Above the existing "Generate Comment Link / Generate Approval Link" buttons, add a collapsible **"Prepare items for Design"** section, visible only to the creator, that lists every BOQ line item in a compact table:

  ```text
  # | Model | Description | Qty | Unit | Remarks (editable) | Files
  ```

  - **Remarks** cell: `<Textarea>` bound to the item's `remarks`. On blur (or via a single "Save Remarks" button at the bottom of the section), persist via the same `UPDATE boqs SET line_items=...` path the editor uses — extract that into a small helper (`saveBoqRemarks(boqId, items)` in `src/lib/boq/designReview.ts` or inline) so both surfaces share one writer. Also append the same `boq_remarks_audit_log` entries the editor writes today.
  - **Files** cell: reuse the existing `<BoqItemAttachments boqId itemId />` popover unchanged.
  - Disable both controls when `locked` (approved / final_sent), matching editor rules.
- The "Generate …" buttons remain exactly as today; no change to round creation, tokens, or RPCs.

### 3. Out of scope (do NOT change)
- Design Review page, RPCs, RLS, storage buckets, attachment schema.
- Any other column (Model, Description, Qty, Unit, Make, Approval).
- PDF/Excel exports, distribution emails, verification flow.

## Technical notes

- Single source of truth for line_items stays the `boqs.line_items` JSON column. The new panel mutates a local copy and writes back via the shared helper; on success it calls `onChange()` so the editor refreshes.
- Re-use the existing `boq_remarks_audit_log` insert payload (`old_remarks` / `new_remarks` / `item_id`) from `BoqEditor.saveRemarks` — move it into the helper to avoid drift.
- No DB migration, no new tables, no new policies, no edge-function changes.

## Acceptance

1. Creator opens a BOQ whose status is `design_sent`: Remarks textareas in the main table are editable; "Save Remarks" button works.
2. In the Design Review panel, the creator sees the per-item list with editable Remarks and the same paperclip popover. Saving Remarks updates the BOQ and the editor table without a page reload. Uploading a file shows up in the popover badge.
3. Non-creators see the section read-only (or hidden) — never lose existing permission boundaries.
4. Every other BOQ feature (approval flow, link generation, PDF, verification, design review submission) behaves identically to before.

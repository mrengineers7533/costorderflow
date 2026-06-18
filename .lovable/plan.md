## Issue

When an OA is revised (e.g. R3 → R4), `reviseOrder` calls `reviseBoqFromOrder` to auto-create a matching new BOQ revision. That function rebuilds the BOQ line items from the new OA but **drops** the per-item `approval_status` / `approval_comment` snapshot from the previous BOQ revision, and does not copy the per-item rows in `boq_item_design_status`.

Because the OA editor's "Approved by Design" column (`approvalByOaItem` in `OrderEditor.tsx`, lines 348–372) reads from `currentBoq.line_items[].approval_status`, every item on the new OA revision shows as Pending even though it was Approved on the previous revision.

## Fix (scope: revision carry-forward only)

Edit one file only: `src/lib/revisions/index.ts`, function `reviseBoqFromOrder` (around lines 189–242). No other module, page, schema, or workflow changes.

1. When building the new BOQ `items` array from `orderRev.line_items`, look up the previous BOQ item (already matched by `description|model_number` via `prevByKey`) and carry over its approval snapshot:
   - `approval_status: prev?.approval_status ?? undefined`
   - `approval_comment: prev?.approval_comment ?? undefined`
   
   This is identical to how the existing in-place `syncBoqsAndPisForOrder` path preserves `prev?.approval_status` on a non-open BOQ (lines 342–343) — we just apply the same preservation in the "new revision" path.

2. After the new BOQ row is inserted, copy the matching `boq_item_design_status` rows from `(prevBoq.id, prevBoq.revision)` to `(newBoq.id, newBoq.revision)`, remapping `boq_item_id` from the old item's id to the new item's id using the same `description|model_number` match used above. Insert one row per matched item carrying over `status`, `decided_by`, `decided_by_name`, `decided_by_department`, `decided_at`. This keeps the Design page (`DesignBoqView` → `fetchItemApprovals`) showing the same Approved/Pending state on the new revision until the user manually changes it.

Both steps are best-effort: items that don't match a previous item (e.g. newly added line items in the revised OA) simply have no approval carried over and default to Pending, which matches the user's "unless manually changed later" requirement.

## Verification

- Take an existing OA where R-current has at least one item marked Approved by Design.
- Click "Create new revision" on the OA.
- Open the new OA revision: the "Approved by Design" column should show the same Approved/Pending state per item as the previous revision.
- Open the auto-created BOQ revision in the Design page: per-row Approve/Pending checkboxes should reflect the carried-over state.
- Manually flipping an item on the new revision still works (existing `setItemApproval` + `syncApprovalToBoqSnapshot` path is untouched).

## Out of scope

No change to: per-item approval write path, OA editor read mapping (`oaToBoqItemId`, `approvalByOaItem`), Design page bulk/per-row toggles, OA-driven `syncBoqsAndPisForOrder` in-place sync, BOQ verification flow, notifications, PDFs, Manufacturing, Purchase, PI, RLS, schema, or any other screen.

## Files

- `src/lib/revisions/index.ts` — `reviseBoqFromOrder`: preserve `approval_status` / `approval_comment` on carried items, and clone matching `boq_item_design_status` rows to the new BOQ revision.

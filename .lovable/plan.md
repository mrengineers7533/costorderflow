# Per-item Approve on Design BOQ page

Today the Design page only has one **Approve Revised BOQ** button that approves the whole BOQ at once. We will add per-line-item approval so the user can tick exactly the items they want to approve, or use a **Select All** checkbox to approve every item in one click.

The existing table `boq_item_design_status` already supports per-item decisions (`status`, `decided_by`, `decided_at`, `boq_revision`, `reason`), so no schema changes are needed.

## What changes for the user (on `/design/:id`)

1. A new first column **Approve** appears in the line-items table.
   - Header cell shows a **Select All** checkbox (tri-state: unchecked / indeterminate / all-checked).
   - Each row gets its own checkbox.
2. Ticking a row immediately saves an `approved` decision for that item against the current BOQ revision. Un-ticking reverts it to `pending`.
3. A small status pill next to each checkbox shows the current state for that row (`Pending` / `Approved` / approver name + time on hover).
4. The bottom action bar gets a new summary: `X of Y items approved`.
5. The existing **Approve Revised BOQ** button is renamed **Finalize Approval** and is enabled only when every item is approved (or kept as a shortcut that approves all remaining items first, then finalizes). It still performs the same final BOQ status flip that releases to Purchase & Manufacturing — unchanged logic.
6. Checkboxes are disabled when the BOQ is already `design_approved`/`final_sent`, or while it is in `changes_requested` (awaiting OA revision), matching the existing gating rules.

Comments, auto-save, Post Submit, revision history, and all BOQ/OA calculations remain exactly as they are.

## Technical details

**New file: `src/lib/design/itemApprovals.ts`**
- `fetchItemApprovals(boqId, revision)` → reads `boq_item_design_status` rows for this BOQ+revision, returns `Record<itemId, { status, decided_by_name, decided_at }>`.
- `setItemApproval(boqId, itemId, revision, status: 'approved' | 'pending')` → upserts a row keyed by `(boq_id, boq_item_id, boq_revision)`. For `pending` it can delete the row or update status; we'll update so we keep history. Captures `decided_by`, `decided_by_name`, `decided_by_department` (reuse the lookup pattern from `addDesignComment`), and `decided_at = now()`.
- `bulkSetItemApprovals(boqId, itemIds, revision, status)` → loops the same upsert; used by Select All.

**Edits in `src/pages/design/DesignBoqView.tsx`**
- Load approvals in `refresh()` alongside comments; store in `approvals` state keyed by `item.id`.
- Add a new `<TableHead>` with the Select All `Checkbox` and a new leading `<TableCell>` per row with the row `Checkbox` + a small badge.
- Select All handler: derives target status (approve all if not all approved, else clear all) and calls `bulkSetItemApprovals`, then refreshes.
- Row handler: optimistic update + `setItemApproval`; on error revert and toast.
- Bottom bar: show `approvedCount / items.length items approved`. Update the Approve button's `disabled` to also require `approvedCount === items.length` (or change its onClick to first bulk-approve any remaining items, then call existing `approveRevisedBoq`).
- All existing gating (`alreadySubmitted`, `designApproved`, `canApprove`) is reused unchanged for disabling the new checkboxes.

**No changes** to: `boqs` schema, `submitDesignComments`, `approveRevisedBoq` body, OA flow, revised-BOQ generation, Purchase/Manufacturing visibility filters, notifications, calculations, PDF/Excel exports.

## Out of scope
- Partial release to Purchase based on per-item approval (still gated by whole-BOQ `design_approved`).
- Reviewer-level RLS changes; existing policies on `boq_item_design_status` are assumed to permit the Design reviewer to write.

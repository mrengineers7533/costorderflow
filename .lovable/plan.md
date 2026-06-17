# Sync Design per-item approval status to OA

## Problem
Design page writes per-item approval to `boq_item_design_status` (per revision). OA reads `boqs.line_items[].approval_status` (snapshot). The two are not kept in sync, so toggling Approved → Unapproved/Pending on Design does not show on OA.

## Fix (Design → OA only)
Add a small write-through helper that, whenever Design changes a per-item approval, also patches the matching items inside `boqs.line_items[].approval_status` (the same field OA already reads via `approvalByOaItem`). No schema change, no OA logic change.

### 1. New helper in `src/lib/design/itemApprovals.ts`
```ts
export async function syncApprovalToBoqSnapshot(
  boqId: string,
  itemIds: string[],
  status: "approved" | "pending",
): Promise<void>
```
- Fetches `boqs.line_items`.
- For each item whose `id` is in `itemIds`, sets `approval_status` to `"approved"` or `"pending"`.
- Writes the array back via `supabase.from("boqs").update({ line_items }).eq("id", boqId)`.
- Best-effort: errors are caught and logged (does not break the UI).

### 2. Call the helper from Design page — `src/pages/design/DesignBoqView.tsx`
After every successful approval write, call the sync helper with the affected ids and new status:
- `toggleItemApproval(itemId, next)` → after `setItemApproval` succeeds.
- `handleApprove()` bulk path → after `bulkSetItemApprovals(missing, ..., "approved")`, also sync all `items.map(i => i.id)` as `approved`.
- `saveNow()` auto-clear-on-comment path → after `setItemApproval(... "pending")`, sync that id as `pending`.

That is the only behavioural change.

## Out of scope (untouched)
- Schema/RLS, RPCs, `boq_item_design_status` semantics.
- `fetchLatestApprovalRound`, `resolveLatestApprovalStatuses`, design review workflow, `submitDesignComments`, `approveRevisedBoq`.
- OA totals/charges/saved payload/PDF/print/Excel/notifications/acknowledgement/revised logic/auto BOQ.
- Manufacturing, Purchase, OA Creator behaviour, any other department screen.
- OA-side reading code (`approvalByOaItem`) — already reads exactly the field we update.

## Files
- `src/lib/design/itemApprovals.ts` — add `syncApprovalToBoqSnapshot`.
- `src/pages/design/DesignBoqView.tsx` — three call sites above.

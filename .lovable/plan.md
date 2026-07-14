## Root cause

In the Design page, all 11 revisions of `MRBOQ/26-27/0002` appear as separate rows even though `DesignBoqList` already has the same family-collapse logic as Admin.

The Admin `BoqList` collapses siblings by looking up `orders.parent_order_id` to compute a family root. Each BOQ revision points to a different `order_id`, and the family map is what merges them.

For Design users, `orders` RLS (`orders_select_doc_access`) requires document-level access to each OA. Design module only grants view access to BOQs, so the `orders` lookup returns 0 rows, `rootById` is empty, and each revision falls back to its own `order_id` — so nothing collapses.

Verified in DB: all 11 rows in the affected family share the identical `boq_number` `MRBOQ/26-27/0002/R10` but have 11 distinct `order_id`s.

## Fix (listing-only, Design page)

Update the family key derivation in `src/pages/design/DesignBoqList.tsx` to fall back to `boq_number` when the `orders` lookup can't provide a root. Since revised BOQs already share the same `boq_number` within a family, this collapses the list correctly without any RLS, schema, or workflow change.

New family key order per row:
1. `rootById.get(order_id)` — same as Admin, used when orders are visible.
2. `boq_number` — new fallback for Design users whose `orders` SELECT is filtered.
3. `order_id` then `id` — final safety fallback.

Selection rule for the surviving row stays the same as Admin: highest `revision`, tiebreak by newer `created_at`/`updated_at`.

## Not changed

- Admin `BoqList` untouched.
- No RLS, GRANTs, RPCs, migrations, or database rows changed.
- Revision history, comments, approvals, OA revision, and revised BOQ generation unchanged.
- Opening a BOQ still shows all older revisions via the existing revision history.

# Sync Design BOQ approval status everywhere

## Problem

The Design page (`DesignBoqView`) writes per-item approvals to `boq_item_design_status`. The BOQ page (`BoqEditor`) and the print/PDF path (`src/lib/boq/pdf.ts`, `approvalSync.ts`) read `boqs.line_items[].approval_status`, which is only synced from the *external* design-review system (`boq_design_reviews`) — not from the internal Design page table. Result: an item approved on the Design page shows Approved there only; the BOQ page and print page still show Pending.

Notifications for `boq_item_design_status` changes already exist (`notif_on_boq_item_design_status` → event `design_item_status_changed`, source module `design`, excludes Design, includes OA number / Line / Model / Description / Old / Current / Approved-by / time). No notification work needed.

## Fix — single source of truth

Add a `SECURITY DEFINER` trigger on `boq_item_design_status` (AFTER INSERT/UPDATE) that writes the decision through to `boqs.line_items` for the **same revision only**:

- Locate the BOQ row by `boq_id`, only act when `boqs.revision = NEW.boq_revision` (don't touch older snapshots).
- Update the matching element of `boqs.line_items` (by `id`) setting `approval_status` to `approved` when `NEW.status = 'approved'`, `pending` otherwise.
- No-op when the value is unchanged (avoids trigger loop with `notif_on_boqs`).
- Idempotent on bulk approval; uses `jsonb_set` over an `ordinality` scan.

Also extend the family/sibling propagation: for sibling BOQs in the same OA family (`orders.parent_order_id`), match line items by normalized `description` and patch their `approval_status` the same way — mirrors the existing logic in `BoqEditor.tsx:146-183` but server-side and unconditional.

## Client read paths — already correct once DB is synced

- `BoqEditor.tsx` reads `boqs.line_items[].approval_status` → renders Approved/Pending badge (line 795).
- `src/lib/boq/pdf.ts:201` reads `it.approval_status` for the "Approved by Design" column.
- `approvalSync.ts` (used by distribution PDF) already write-throughs from the external review round; the new trigger covers the internal Design page.

No UI changes. No new client logic. No duplicate approval store.

## Notifications — already satisfied

The existing `notif_on_boq_item_design_status` trigger (migration `20260616102204…`) emits one notification per item change with OA / Line / Model / Description / Field=Approve / Old / Current / actor / time and routes via `emit_notification` with source module `design` (Design excluded; OA, Purchase, Manufacturing, etc. receive). No change required.

## Verification

1. Approve a single item on `/design/:id` → reload `/boqs/:id` → that one row shows "Approved by Design", others Pending. Open BOQ print PDF → same item shows Approved.
2. Approve all items + click "Approve Revised BOQ" → all rows Approved on BOQ page and PDF; status persists across refresh.
3. Sibling BOQs in the same OA family reflect the same per-item Approved status.
4. Notifications dashboard shows one entry per approved item for OA/Purchase/Manufacturing recipients; none for Design.

## Out of scope

BOQ UI, print layout, Not-Seen logic, Acknowledge behaviour, dashboard, OA/BOQ/PI/Cost-Sheet formulas.

## Files

- New migration: trigger `sync_design_status_to_boq_line_items` on `boq_item_design_status`.
- No client file edits.

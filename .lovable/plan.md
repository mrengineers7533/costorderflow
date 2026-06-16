# Notification System Fix — Plan

## Diagnosis (current behaviour, from DB + code)

The notification "service" already exists and is shared: one writer (`public.emit_notification`), one reader RPC for pages (`get_related_notifications`), one count RPC (`count_unread_notifications`), one badge component (`NotSeenNotifBadge`) + one banner (`ModuleNotifications`), one hook (`useUnseenNotifCount`). The bugs are not because of duplicated logic; they are configuration + a few gaps:

1. **Module column is empty in `notification_recipients`.** Every active row has `module = NULL` today. The exclusion in `emit_notification` is `module = src_module OR (module IS NULL AND department = actor_dept)`, so today it collapses to *department-only* exclusion. That breaks the Costing → OA/BOQ/PI rule: a Costing recipient is excluded for any OA/BOQ/PI edit, instead of only the sub-module that performed it.
2. **`current_user_modules()` returns empty array** for everyone (same root cause), so the receiver-side filter in `count_unread_notifications` and `get_related_notifications` is short-circuited by `cardinality(mods) = 0`. Net effect: actor can sometimes see their own notification if they belong to a department that wasn't matched.
3. **Manufacturing & Purchase pages have no badge/banner mounted.** `ManufacturingList`, `ManufacturingDetail`, `PurchaseList`, `PurchaseDetail`, `PurchaseLanding`, `PoFolder`, `PurchaseMaterial` do not import `NotSeenNotifBadge` or `ModuleNotifications`. Counts therefore appear missing on those pages.
4. **Manufacturing is not a recognised source module** in `notif_source_module`. When a mfg user edits a requisition/PO row, the source is mapped to `requisition`/`purchase` and mfg recipients are not excluded.
5. **Design item-wise edits are bundled.** When Design edits 3 fields on one line (Remarks, Approve, Qty), `_format_boq_item_changes` already lists per-field Old/Current — but it produces one notification per OA/BOQ update. User wants each changed field clearly shown; this is detail-level, not a new notification, so we only need to confirm the formatter emits one block per (line × field).
6. **Approval bug** was fixed last turn (per-row only). No further code change here; just a regression test.

## What to build

### A. Backfill + use module-level recipient mapping (single shared service)

1. **Admin Recipients UI already supports `module`** (verified in `AdminNotificationRecipients.tsx`). Add a one-shot data migration that fills `module` for the existing rows from their `department`:
   - `design` dept → module `design`
   - `purchase` dept → module `purchase`
   - `manufacturing` dept → module `manufacturing`
   - `Costing` dept → split: keep the row as `department='Costing', module='oa'`, and clone two rows for `module='boq'` and `module='pi'` (so the same user is reachable for all 3 sub-modules but excluded only from the sub-module they acted on).
   - Other departments (CRM/DME/HR/Project/Reception): leave `module = NULL` (department-wide; they receive everything, never act as a source).
2. **Document the rule in the admin page header** (no UI redesign): "Pick the specific sub-module under Costing (OA/BOQ/PI) so self-exclusion works correctly."

### B. Tighten `emit_notification` exclusion (single function, no page changes)

Rewrite the exclusion so it is purely module-driven when `module` is set, with department only as fallback:

```
exclude row WHERE
  user_id = actor                           -- never notify the actor
  OR (module IS NOT NULL AND module = src_module)
  OR (module IS NULL AND src_module IS NOT NULL
       AND department = actor_dept)         -- legacy rows w/o module
```

Add `manufacturing` to `notif_source_module` for the events that originate from a mfg page (PO row edits made from `ManufacturingDetail`, requisition edits made from mfg). Because we cannot tell from the trigger which UI fired the change, route by **actor's module**: if the actor has `module='manufacturing'` in `notification_recipients`, treat `src_module = 'manufacturing'` for `purchase`/`requisition`/`grn` events. Implement this by changing `notif_source_module` into a helper that also accepts the actor's modules, or by computing `src_module` inside `emit_notification` from `auth.uid()`'s recipient row when the event is a generic purchase/requisition one.

### C. Surface Manufacturing + Purchase pages with the existing components

No new component, no new hook. Mount the shared ones:

- **`ManufacturingList.tsx`** — add a "Not Seen" column per row using `<NotSeenNotifBadge variant="cell" orderRootId={…}/>` (same pattern as `OrdersList`).
- **`ManufacturingDetail.tsx`** — add the top-right badge `<NotSeenNotifBadge orderRootId={…}/>` and `<ModuleNotifications links={{ orderRootId, boqId }}/>` panel under the header.
- **`PurchaseList.tsx`, `PoFolder.tsx`, `PurchaseLanding.tsx`** — add the `variant="cell"` badge in the row.
- **`PurchaseDetail.tsx`, `PurchaseMaterial.tsx`** — add header badge + banner.

These reuse the existing `useUnseenNotifCount` hook, so counts stay consistent with bell + dashboard automatically.

### D. Per-field Design change detail (formatter only)

Update `public._format_boq_item_changes` so a modified line produces one detail block **per changed field** in the order requested: `Approve, Model, Description, Quantity, Unit, Motor, Motor Quantity, Remarks`, followed by any other field. Output stays inside the existing `summary` and structured per-field array inside `new_value->'detail'` (already consumed by `NotificationDetailDialog`). No client change needed.

### E. Receiver-side filter

Once recipients have `module` populated, `current_user_modules()` returns the right set automatically and `count_unread_notifications` / `get_related_notifications` start excluding self-source notifications for the user. This unifies bell, dashboard, page badge, and folder column counts using the **same query path** they already share.

### F. Regression tests

Add `src/test/notifications.test.ts` with pure-logic tests for:
- OA create → targets include design/boq/purchase/manufacturing, excludes oa.
- Design item status change → excludes design, includes oa/purchase/manufacturing.
- OA revision/edit → excludes oa, includes others.
- Purchase edit → excludes purchase.
- Manufacturing edit → excludes manufacturing.
- Single-row Design approval updates only that row id (already-fixed logic).

The tests mock `emit_notification`'s exclusion rule in TS to lock the contract; full SQL behaviour is verified manually post-migration.

## Out of scope (do not touch)

- Notification dashboard layout, Acknowledge button design, sort/filter, real-time subscriptions.
- OA/BOQ/PI/Cost-Sheet calculation/formulas.
- Existing badge/banner UI design — only **mount** them on Manufacturing/Purchase pages.

## Technical change list

- **Migration** (one file):
  - Backfill `notification_recipients.module` from department; split Costing into oa/boq/pi rows.
  - Replace `emit_notification` body with the module-first exclusion above.
  - Extend `notif_source_module` (or compute inside `emit_notification`) to recognise `manufacturing` via actor's recipient module.
  - Rewrite `_format_boq_item_changes` to emit one block per changed field per line, in the required field order.
- **Frontend (mount only)**:
  - `src/pages/manufacturing/ManufacturingList.tsx`, `ManufacturingDetail.tsx`
  - `src/pages/purchase/PurchaseList.tsx`, `PurchaseDetail.tsx`, `PurchaseLanding.tsx`, `PoFolder.tsx`, `PurchaseMaterial.tsx`
- **Tests**: `src/test/notifications.test.ts`.

No new hooks, no per-page count logic, no UI redesign.
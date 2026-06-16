## Issue 1 — Header checkbox auto-approves every row

In `src/pages/design/DesignBoqView.tsx` the table-header `<Checkbox>` is wired to `toggleSelectAll()`, which calls `bulkSetItemApprovals` on every line item the moment it is clicked. The session replay confirms a single click cascades "isChecked: true" to every row. The user expects approvals to be strictly per-row.

**Fix:** Remove the bulk auto-approve from the header.

- Drop the `Checkbox` in the "Approve" `<TableHead>` and keep just the label `Approve`.
- Remove `toggleSelectAll`, `allApproved`, `someApproved`, and `bulkBusy` (and the `bulkSetItemApprovals` import) — no longer referenced.
- Keep the per-row `<Checkbox>` exactly as it is today (`toggleItemApproval` already updates only the clicked item via `setItemApproval`). Each row stays independently approvable.
- Keep the existing footer text "X of Y items approved" (only `allApproved` is removed from there; replace with `approvedCount === items.length`).
- The "approve every remaining item before finalize" call inside `handlePostSubmit` (line ~283) is unrelated to the UI bulk toggle — leave it intact so Post Submit still works.

No changes to the DB, to `setItemApproval`, or to any other page.

## Issue 2 — Item-wise notification details

Two notification sources need richer payloads. Self-exclusion already lives in `emit_notification` from the prior migration and stays unchanged.

### 2a. Design approve / unapprove (`notif_on_design_item_status`)

New migration that rewrites this trigger function so each notification carries:

- `oa_number` (joined from `orders` via `boqs.order_id` → `parent_order_id`)
- `boq_number`, `boq_revision`
- `line_item_no`, `model`, `description` (looked up inside `boqs.line_items` JSON by `boq_item_id`)
- `field_changed` = `'Approve'`
- `old_value` = previous status (`'blank'` when none / first time) — read from `OLD.status` on UPDATE, otherwise look up the prior row in `boq_item_design_status` for the same `(boq_id, boq_item_id)` ordered by `decided_at desc`
- `new_value` = `NEW.status` mapped to display text (`Approved`, `Not Approved`, `Pending`)
- `edited_by_name`, `edited_by_email`, `edited_at` (from `NEW.decided_by_name`, joined profile email, `NEW.decided_at`)
- `source_module` = `'design'`

Title format:
`Design item updated`
Summary lines packed into the existing `summary` text so the current Notification UI/dialog renders them without changes:
```
OA No.: <oa_number>
Line Item: <line_item_no>
Model: <model>
Description: <description>
Field / Option Changed: Approve
Old Value: <old>
Current Value: <new>
```
Full structured copy of the same fields also goes into the `after` JSON for the detail dialog. `source_module := 'design'` is passed so the existing self-exclusion in `emit_notification` already skips Design recipients.

### 2b. BOQ line-item edits (`notif_on_boqs`, `line_items_changed` branch)

Extend `_line_items_diff` consumers so each `line_items_changed` event additionally records, per changed field, one human-readable change block. Implementation:

- Add a small SQL helper `public._format_boq_item_changes(_diff jsonb, _oa text) returns text` that walks the diff and, for each `modified` entry, emits the same Old/Current block per field — restricted to the tracked fields: `model_number`/`model`, `description`, `quantity`, `unit`, `motor`, `motor_quantity`, `remarks`, `approval_status` (label "Approve"). `added`/`removed` items render as `Old Value: blank` / `Current Value: blank` respectively.
- In `notif_on_boqs` (the existing `line_items_changed` PERFORM call), pass that formatted text as the `summary` and stash the structured per-field diff in `after` so the detail dialog can also display it.
- Same treatment in `notif_on_orders` `line_items_changed` (OA edits) so notifications for OA line edits show identical detail.
- `source_module` already flows through the existing module routing (`order`/`boq`) — self-exclusion handled by the prior migration.

### What stays exactly the same

- Notification UI components (`ModuleNotifications`, `NotificationDetailDialog`, `NotSeenNotifBadge`, dashboard, top bell, banner).
- `useUnseenNotifCount`, `useUnreadNotifications`, `get_related_notifications`, `count_unread_notifications`.
- Acknowledge flow, real-time refresh, Not-Seen columns on folder/list pages.
- `notification_recipients` module routing introduced previously.

### Files touched

- `src/pages/design/DesignBoqView.tsx` — remove header bulk checkbox + related state/handlers.
- New `supabase/migrations/<ts>_item_notif_details.sql`:
  - replace `public.notif_on_design_item_status()`
  - add `public._format_boq_item_changes(jsonb, text)`
  - replace `public.notif_on_boqs()` `line_items_changed` branch
  - replace `public.notif_on_orders()` `line_items_changed` branch

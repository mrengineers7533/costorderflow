## Goal

Route Design and Costing changes to Costing, Manufacturing, Purchase, Requisition and Annexure Folder recipients, and expand the notification email so recipients see exactly what changed. Every other notification source and every other feature stays untouched.

## Scope guard (critical)

The relaxed recipient filter applies **only** when the source module (as computed today by `public.notif_source_module(_module, _event)`) is `design` or one of the Costing-owned modules (`oa`, `boq`, `pi`). For every other source (purchase, grn, requisition, annexure, manufacturing, project, or unknown), the existing exclusion rule is preserved bit-for-bit.

## What changes

### 1. Database — `public.emit_notification` recipient filter

Only the `SELECT ... INTO _targets` block is rewritten. Everything else in the function (revision-key merge, `line_item_changes` merge, total row/cell counts, actor remap for Manufacturing, error swallow, grants) stays identical.

New logic:

```sql
IF _src_module IN ('design','oa','boq','pi') THEN
  -- Design & Costing fan-out to downstream target modules only.
  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND module IS NOT NULL
    AND module IN ('oa','boq','pi','manufacturing','purchase','requisition')
    AND (_actor_uid IS NULL OR user_id IS DISTINCT FROM _actor_uid);
ELSE
  -- Unchanged legacy filter for every other source module.
  SELECT COALESCE(array_agg(DISTINCT department), ARRAY[]::text[])
    INTO _targets
  FROM public.notification_recipients
  WHERE is_active = true
    AND (_actor_uid IS NULL OR user_id IS DISTINCT FROM _actor_uid)
    AND NOT (
      (module IS NOT NULL AND _src_module IS NOT NULL AND module = _src_module)
      OR (module IS NULL AND _src_module IS NOT NULL
            AND department IS NOT DISTINCT FROM _actor_dept)
    );
END IF;
```

Notes:
- `oa`/`boq`/`pi` recipient rows represent the Costing team in the existing data — no enum extension or data migration needed.
- Annexure Folder recipients live under `module = 'requisition'` today, matching the existing dept.ts mapping (`annexure` → `requisitions`). Requisition and Annexure users are covered by the single `requisition` entry.
- `DISTINCT department` + upstream `array_agg(DISTINCT ...)` in the merge branch keeps recipient dedupe intact.
- The actor is still filtered by `user_id`, so the exact person who made the change never appears in `target_departments` (and is subsequently excluded from the email loop and Ack rules, as today).
- All downstream gates (`can_ack_notification`, `mark_notification_seen`, `get_related_notifications`, module RLS, `notification_recipients.is_active`, and per-module View permission checks in the mailer) remain the eligibility guarantee — the migration only widens who is *considered*, not who is *authorised*.

Migration ships as a single `CREATE OR REPLACE FUNCTION public.emit_notification(...)` with `SECURITY DEFINER`, `SET search_path = public`, and the existing `GRANT EXECUTE` preserved.

### 2. Edge function — `send-notification-email` HTML body

Only `renderHtml` changes. Routing, sender configuration, department grouping, `email_notification_log` insert/update, idempotency (`notification_id + recipient_email + kind` unique index), retry, reminder join, audit columns, and error handling are untouched.

Additions:
- New "Change Details" section after the summary paragraph, built from `n.line_item_changes`.
- Each entry renders as:

  ```
  Row No.: <line_no>
  Field: <field>
  Previous Value: <before or —>
  New Value: <after or —>
  ```

- Multiple changed fields under the same `line_no` collapse into a single `Row No.` heading with several `Field:` sub-blocks.
- `kind = "added"` → `Row No.: X — Row added`; `kind = "removed"` → `Row No.: X — Row removed`. No before/after pairs for these two kinds.
- Values are passed through the existing `esc()` helper. No raw HTML from data.
- Cap at 50 rendered entries; if more, append `+N more changes — open the notification for the full list.` The full list stays available in the in-app dialog.
- If `line_item_changes` is null/empty, the section is skipped and the existing summary block renders as today.
- Header table gains a `Document Type` line (human label from `n.module`: BOQ, OA, PI, Purchase Order, GRN, Requisition, Annexure, Design Comment). Pure formatter, no data change.

Redeploy `send-notification-email` after the edit.

### 3. Preserved / not changed

`notif_source_module`, `_notif_revision_key`, `_notif_merge_changes`, `can_ack_notification`, `mark_notification_seen`, `get_related_notifications`, `notification_recipients` schema/RLS/data, `email_notification_config`, sender configuration UI, `send-notification-test-email`, reminder cron, retry, storage, notification bell, Seen/Ack UI, unseen counts, `AdminEmailAudit`, in-app `NotificationDetailDialog`, approval/revision/calculation logic, RLS on target tables, PDFs, numbering, module pages.

## Technical notes

- Single SQL migration + one edge-function edit + one deploy. No new tables, no new secrets, no enum changes, no client changes.
- `emit_notification` retains its `EXCEPTION WHEN OTHERS` guard, so any recipient-lookup or email trigger failure still cannot block the underlying save/approval/revision.
- Regression verification after apply:
  1. Design comment save → confirm `email_notification_log` has one row per Costing/Manufacturing/Purchase/Requisition department (`status='sent'`) and the actor is absent.
  2. OA line-item edit by a Costing user → same downstream fan-out, actor absent.
  3. Purchase (or any non-Design/non-Costing) change → recipient list identical to today (regression check against a snapshot from `email_notification_log` before/after).
  4. Rendered email HTML contains the `Row No. / Field / Previous / New` block for merged multi-field notifications.

## Out of scope

- Adding new recipient modules or `notif_module` enum values.
- Any change to Seen/Ack UI, counts, reminders, or sender configuration.
- OA/BOQ/PI/PO/GRN/Requisition/Annexure/Manufacturing business logic, RLS, calculations, numbering, or UI.

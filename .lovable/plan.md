## Goal

Add a Design-comment → OA-revise → auto-BOQ-revise → Design-verify loop on top of the existing OA/BOQ flow. No existing calc/workflow/permission changes — only comments visibility, "Apply / Manual change" affordance, revised-BOQ surfacing, item-wise history, item-wise Design status, and notifications.

## Scope (what's already in place)

- Cell-wise Design comments on Design BOQ exist (`boq_design_comments`, `addDesignComment`, `DesignBoqView`).
- OA → auto BOQ revise already runs server-side.
- Cross-department notifications + Seen tracking already exist via `app_notifications`, `app_notification_reads`, `ModuleNotifications`, `NotificationDetailDialog`, `get_related_notifications`.
- BOQ verification flow exists (`verify_boq_items_with_token`, item-level approval_status).

This plan reuses all of the above; we only add what's missing.

## Database (one migration)

1. `public.boq_design_comments` — add:
   - `applied_to_oa_at timestamptz`, `applied_to_oa_by uuid`, `applied_value text`, `oa_revision_id uuid` (audit only; nullable; no FK change to existing tables).
2. New `public.boq_item_design_status` (item-wise Design approval on a specific BOQ revision):
   - `id, boq_id, boq_revision int, boq_item_id text, status text check ('pending','approved','not_approved'), reason text, decided_by uuid, decided_by_name text, decided_by_department text, decided_at timestamptz, created_at, updated_at`.
   - Unique `(boq_id, boq_revision, boq_item_id)`.
   - GRANT select/insert/update to authenticated; service_role all. Anon: none.
   - RLS: select for authenticated; insert/update only for users whose `notification_recipients.department = 'design'` OR `has_role(auth.uid(),'admin')`.
   - Trigger: on insert/update emit a notification via existing `emit_notification('boq','design_item_status_changed', …)` so it fans out to OA/PI/Purchase/Mfg/Req/Annex/Dashboard pages and Seen tracking already applies.
3. Helper RPC `apply_design_comment_to_oa(_comment_id, _oa_id, _applied_value text)` — sets the audit columns on the comment row (no OA write; UI handles the editable field write through the normal OA save flow so existing revision logic runs unchanged).

No changes to: `orders`, `boqs`, existing triggers, existing functions, OA/BOQ calc, auto-revise, permissions, approval flow.

## Frontend

### `src/components/orders/OaDesignCommentsPanel.tsx` (new)
- Reads `boq_design_comments` for the BOQ(s) linked to the current OA (via `orders.id`/`parent_order_id` → `boqs.order_id`).
- Shows table: BOQ #, OA #, Line item #, Field, Current OA value, Design comment, By, Date, and two buttons:
  - **Apply Comment** → calls a callback that writes the suggested value into the matching OA line-item field in local OA editor state (does NOT save). Calls `apply_design_comment_to_oa` to mark the comment as applied.
  - **Manual Change** → just scrolls/focuses the matching OA row + field; no auto-write.
- Banner note: "Review and save to trigger OA revision."

### `src/pages/orders/OrderEditor.tsx`
- Mount `OaDesignCommentsPanel` near the top of the line-items section, wired to current OA editor state (`setLineItems` for Apply).
- No changes to save/revise logic.

### `src/pages/design/DesignBoqView.tsx`
- Add per-row "Updated"/"Changed" badge: compare current BOQ revision's item values vs previous revision (`boq_revisions` already stored) — if any tracked field differs, show badge.
- Add collapsible **History** button per row → reads `boq_revisions` + related `app_notifications` (line_item_changes) for that item; shows Old → New, changed by, datetime, related Design comment (match by `boq_item_id`+column), OA revision #, BOQ revision #.
- Add right-side column **Design Status** with item-wise dropdown (Pending / Approved / Not Approved). On "Not Approved", require a reason via dialog. Persists to `boq_item_design_status`.
- Bulk actions toolbar: **Approve All**, **Mark All Pending**, **Mark Selected Not Approved** (multi-select via row checkboxes).
- Read-only enforcement: existing — Design cannot edit cell values; only comments + status.

### `src/components/notifications/ModuleNotifications.tsx`
- No structural change; the new `design_item_status_changed` events flow through existing `get_related_notifications` because we pass the BOQ's `related_boq_id` / `related_order_root_id` on insert.

## Out of scope

- No changes to OA save/revise, auto BOQ revise, BOQ verification token flow, calc, PDF, permissions, requisition/annexure/PO/PI/manufacturing logic.
- No new schema on `orders`, `boqs`, `proforma_invoices`, etc.
- No edits to existing triggers/functions beyond adding one new trigger on the new table.

## Risks / notes

- Apply Comment only writes to local OA editor state — user must hit existing Save to trigger revision. This keeps all OA/BOQ revision logic untouched.
- Item-wise Design status is stored per `(boq_id, boq_revision, boq_item_id)` so historical revisions retain their statuses; UI shows status for the BOQ revision currently being viewed.
- Notification fan-out uses the existing `emit_notification` + `app_notification_reads` Seen sync — no duplicate notification system.

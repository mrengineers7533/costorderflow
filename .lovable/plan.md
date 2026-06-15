# Cross-Department Notification System (Add-only)

This builds on the existing `app_notifications` / `app_notification_reads` / `emit_notification()` infrastructure already in place. **No OA / BOQ / PI / PO / Requisition / Manufacturing / Costing / Design business logic, calculations, approvals, or workflows are touched.** Only notification capture, linking, display, detail view, and Seen tracking are extended.

## 1. Database — link notifications across related records

Add a single new migration that adds linkage columns + helper RPC + a few missing triggers. Nothing existing is dropped or altered.

**`app_notifications` — new optional link columns** (all nullable, indexed):
- `related_order_root_id uuid` — OA family root (`orders.parent_order_id` or self)
- `related_boq_id uuid`
- `related_pi_id uuid`
- `related_po_id uuid`
- `related_requisition_id uuid`
- `related_annexure_id uuid`
- `line_item_changes jsonb` — array of per-row `{line_no, before:{...}, after:{...}, changed_fields:[...]}` used by the detail view

**Update `emit_notification()`** to accept the new optional params and persist them. Existing call sites keep working (defaults `NULL`).

**Update existing trigger functions** to populate links (read-only computation, no writes to other tables):
- `notif_on_orders` → set `related_order_root_id = COALESCE(parent_order_id, id)`; compute `line_item_changes` from `OLD.line_items` vs `NEW.line_items` on UPDATE; on revision INSERT, diff vs `revised_from_id`.
- `notif_on_boqs` → set `related_boq_id = NEW.id`, `related_order_root_id` via join on `orders`; line-item diff from `NEW.line_items` vs `OLD.line_items`.
- `notif_on_pi` → set `related_pi_id`, plus `related_order_root_id` / `related_boq_id` via join.
- `notif_on_po` → set `related_po_id`, plus `related_requisition_id` / `related_boq_id` / `related_order_root_id` via joins through `purchase_order_rows` → `requisition_raw_materials` → `requisitions` → `boqs` → `orders`.
- `notif_on_req` → set `related_requisition_id`, `related_boq_id`, `related_order_root_id`.
- `notif_on_design_comment` → set `related_boq_id`, `related_order_root_id`; include `line_item_id`, `column_key`, comment text in payload.

**New triggers added** (currently missing):
- `notif_on_annexure` on `requisition_annexures` (INSERT / UPDATE) → emits with `related_annexure_id`, `related_requisition_id`, …
- `notif_on_annexure_rows` on `requisition_annexure_rows` (INSERT / UPDATE / DELETE) → row-level change summary into `line_item_changes`.
- `notif_on_grn` already exists; extend to link `related_po_id` / `related_requisition_id`.
- `notif_on_manufacturing_change` on whichever table the Manufacturing module writes change-requests to (will confirm during build by reading `src/pages/manufacturing/*`).

**New RPC `get_related_notifications(p_module text, p_record_id uuid)`** — `SECURITY DEFINER`, returns notifications where the record matches the row itself **or** any of its linked ids (OA root → all child BOQ/PI/PO/Req/Annexure; BOQ → its OA/PI/PO/Req; etc.). This is what every module banner calls so the same notification appears wherever the record is referenced.

Grants: `GRANT EXECUTE ON FUNCTION ... TO authenticated`. No new tables, so no new GRANT-on-table block needed.

## 2. Shared frontend pieces

**`src/components/notifications/ModuleNotifications.tsx`** (existing) — replace its query with the new `get_related_notifications` RPC and accept a `record` prop describing the page's record (`{ module, id, orderRootId?, boqId?, piId?, poId?, requisitionId?, annexureId? }`). UI stays the same: collapsible amber banner, short summary, badge, `Seen / Acknowledge` button, `Details` link → opens the dashboard detail dialog (deep link `/notifications?id=<uuid>`).

**`src/components/notifications/NotificationDetailDialog.tsx`** (new, extracted from the existing dashboard dialog) — single source of truth for the detail view. Reused by the dashboard and by an "open details" trigger on each page banner. Shows:
- Header: title, module, ref no., client, changed by (user + dept), date/time, revision (if any).
- **Field-level diff** for top-level fields (with `HIDDEN_FIELDS` still applied).
- **Line-item diff section** rendered from `line_item_changes`: only changed rows, columns Model / Description / Qty / Unit / Motor / Motor Qty / Remarks / etc., shown as Before vs After.
- **Department-wise Seen/Not Seen grid**: Total / Seen / Not Seen counts, then per department: name, status badge, "Seen by <user> at <time>" or "Not Seen".
- Acknowledge button (calls existing `app_notification_reads` insert; idempotent via existing unique constraint).

**`src/hooks/useUnreadNotifications.ts`** — unchanged (already polls correctly).

## 3. Module pages — add/refresh banners

For each page below, mount `<ModuleNotifications record={...} />` near the top (most already have it; this pass standardizes the `record` prop so cross-linking works):

| Page | File | Record prop |
|---|---|---|
| Order editor | `src/pages/orders/OrderEditor.tsx` | order + orderRootId |
| BOQ editor | `src/pages/boqs/BoqEditor.tsx` | boqId + orderRootId |
| Design BOQ view | `src/pages/design/DesignBoqView.tsx` | boqId + orderRootId |
| PI editor | `src/pages/pi/PiEditor.tsx` | piId + boqId + orderRootId |
| Purchase detail | `src/pages/purchase/PurchaseDetail.tsx` | poId + requisitionId + boqId + orderRootId |
| Purchase landing/list | (banner only on detail; list keeps the bell) | — |
| Requisition detail | `src/pages/requisitions/RequisitionDetail.tsx` | requisitionId + boqId + orderRootId |
| Annexure folder | `src/pages/requisitions/AnnexureFolder.tsx` | annexureId + requisitionId + … |
| Manufacturing detail | `src/pages/manufacturing/ManufacturingDetail.tsx` | boqId + orderRootId |
| GRN list/detail | `src/pages/grn/GrnList.tsx` | poId |
| Approved BOQ module | `src/pages/modules/ApprovedBoqModule.tsx` | boqId + orderRootId |

Banner behaviour everywhere: never auto-mark; only the `Seen / Acknowledge` click writes to `app_notification_reads`. Because it's the same row used by the dashboard, status syncs both ways automatically.

## 4. Notification Dashboard

`src/pages/notifications/NotificationDashboard.tsx`:
- Switch the row → detail open path to the extracted `NotificationDetailDialog`.
- Support `?id=<uuid>` query param to deep-link from page banners.
- KPI cards / filters / module badges remain.
- List view stays short-summary only (title, module, ref, client, changed by, time, changes count, dept Seen/Total badge).

## 5. Safety / non-goals

- No edits to: order/BOQ/PI/PO/requisition/annexure/GRN write paths, calculation files (`src/lib/orders/calc.ts`, `src/lib/pi/calc.ts`, etc.), approval/verification RPCs, RLS on existing tables, permissions/`useUserAccess`, sidebar structure, or Design read-only rules.
- No new tables; only additive columns + new RPC + new triggers on annexure/manufacturing.
- Design page stays read-only; only comment-add path emits notifications (already wired).

## Files

**New**
- `supabase/migrations/<ts>_notification_links_and_line_diffs.sql`
- `src/components/notifications/NotificationDetailDialog.tsx`

**Edited**
- `src/components/notifications/ModuleNotifications.tsx`
- `src/pages/notifications/NotificationDashboard.tsx`
- Module pages listed in section 3 (banner prop standardization only)

## Open question

The user listed Manufacturing change-requests as a notification source. The current schema doesn't show a dedicated "manufacturing change request" table — I'll wire it to whichever table the Manufacturing module currently writes to (confirmed during build by reading `src/pages/manufacturing/*` and `src/components/manufacturing/*`). If no such table exists yet, that one trigger will be skipped and noted, since adding new business tables is out of scope for this notification-only update.

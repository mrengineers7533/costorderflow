## Goal
One notification per document-revision per linked department, even when many rows/cells changed. Clicking the notification opens the existing original page (BOQ editor, OA editor, PO, PI, Requisition, Annexure, Manufacturing) unchanged, with the changed cells highlighted inline and an Old → New popover on hover/click. Actor exclusion and dept-locked ack stay as today.

## Non-goals (untouched)
- Page layouts, tables, forms, columns, buttons, styling.
- Existing triggers, emit call sites, badges, dashboard, email functions, sidebar.
- Historical notification rows (no backfill).
- The existing `NotificationDetailDialog` continues to work for users who open from the dashboard.

## Changes

### 1. DB migration — per-revision merge in `emit_notification`
Replace the current "no merge" fan-out with a per-revision, per-target-department merge:

- Compute `_revision_key`:
  - `order` → `_record_id || ':' || COALESCE(NEW.revision_no::text,'0')`
  - `boq` → `_boq || ':' || revision_no` (read from `boqs.revision_no`)
  - Other modules (pi/po/requisition/annexure/grn/design_comment): fall back to `_record_id || ':' || date_trunc('day', now())` (each save batch within the same day on the same doc merges).
  - The exact key per module is stored as a new `app_notifications.revision_key text` column (nullable, indexed).
- For each target dept, look up the most recent un-acknowledged row with `(module, record_id, target_departments[1], revision_key)`. Un-acknowledged = no row in `app_notification_reads` for any user in that department.
  - If found: `UPDATE` it — append `_line_changes` items (dedup by `line_no`+`changed_fields`), bump `merge_meta.merge_count`, set `merge_meta.last_merged_at`, bump `updated_at` (and `created_at` stays as first occurrence), set title to e.g. `<Module> Updated — N changes`.
  - If not found: `INSERT` as today, with `revision_key`.
- Keep existing actor exclusion, source-module exclusion, suppression guard, exception handler.
- Add column `revision_key text` + index `(module, record_id, revision_key, target_departments)`.

No caller / trigger changes; the merge happens inside `emit_notification`.

### 2. DB migration — audit metadata
Add `total_changed_rows int`, `total_changed_cells int` generated from `line_item_changes` on insert/update (computed in `emit_notification`). All other audit fields (Notification ID, Created At, Document No, Source Module, Actor Dept, Target Dept, Event ID, Seen Status, Ack By, Ack At) already exist.

### 3. Notification → original page deep-link
When the user clicks a notification (banner row or dashboard row), navigate to the existing module page with `?notif=<id>` (and `&row=<line_no>` if the click was on a specific row in the dialog).

Mapping (uses the related_* ids already on the row):
- `boq` → `/boqs/:related_boq_id?notif=…`
- `order` → `/orders/:related_order_root_id?notif=…`
- `pi` → `/pi/:related_pi_id?notif=…`
- `purchase` → `/purchase/:related_po_id?notif=…`
- `requisition` → `/requisitions/:related_requisition_id?notif=…`
- `annexure` → existing annexure detail route with `?notif=…`
- `manufacturing` / `grn` → existing detail routes.

Add a small `Open page` button next to the existing `Details` button in `ModuleNotifications` and in `NotificationDetailDialog`. The existing dialog view stays as a fallback.

### 4. Highlight layer (no layout changes)
New shared utility + hook:
- `src/lib/notifications/highlight.ts` — fetches notification by `notif` query param, returns a memoized lookup:
  - `getChange(rowKey, field): { before, after } | null`
  - `isChangedRow(rowKey): boolean`
- `src/hooks/useNotifHighlight.ts` — wraps the fetch + `useSearchParams`.
- `src/components/notifications/HighlightCell.tsx` — drop-in wrapper that adds `bg-amber-100 text-red-700 ring-1 ring-amber-300` and a `Popover` showing `Old: … → New: …` when changed. Renders children untouched when no change.

The row key is `line_no` (already present in `LineChange`). Each page's existing cell render is wrapped in `<HighlightCell rowKey={item.line_no} field="quantity">{value}</HighlightCell>` — no other DOM changes.

Pages wired in this change (table cells only):
- `src/pages/boqs/BoqEditor.tsx`
- `src/pages/orders/OrderEditor.tsx`
- `src/pages/pi/PiEditor.tsx`
- `src/pages/purchase/PurchaseDetail.tsx`
- `src/pages/requisitions/RequisitionDetail.tsx`
- `src/pages/requisitions/AnnexureFolder.tsx` detail view (or its row component)
- `src/pages/manufacturing/ManufacturingDetail.tsx`

For each page, only the cell renderers in the existing table get wrapped. No new sections, headers, layouts, or columns.

### 5. Auto-clear highlight
On page mount with `?notif=…`, the page calls `ack-if-target` (no-op for non-target dept) and removes the `notif` param from the URL after the user clicks anywhere outside a highlighted cell. The highlight stays sticky until removed so the user can review all changes.

### 6. Banner + dialog wiring
- `ModuleNotifications.tsx`: row click (or new Open button) → navigate to deep link; existing Details button unchanged.
- `NotificationDetailDialog.tsx`: add `Open in page` action; per-row "Go to row" buttons append `&row=<line_no>`. No removal of existing tables.

### 7. Audit fields card
The dialog's existing `NotificationMetadataCard` adds two read-only rows: `Total Changed Rows`, `Total Changed Cells`. Source values come from the new columns.

### 8. Tests
- New vitest `notificationMergePerRevision.test.ts`: simulates 3 changes in same BOQ revision across 4 target depts ⇒ 4 rows total, each with `merge_count = 3` and 3 line changes; a new revision_key produces a fresh row per dept.
- Extend `notificationDetailRowHighlight.test.tsx` with a `HighlightCell` unit test (changed vs unchanged, popover content).

## Files

New
- `supabase/migrations/<ts>_notifications_per_revision_merge.sql`
- `src/lib/notifications/highlight.ts`
- `src/hooks/useNotifHighlight.ts`
- `src/components/notifications/HighlightCell.tsx`
- `src/test/notificationMergePerRevision.test.ts`

Edited (presentation/wiring only)
- `src/components/notifications/ModuleNotifications.tsx` — add Open-in-page action.
- `src/components/notifications/NotificationDetailDialog.tsx` — add Open-in-page + per-row deep link + 2 audit rows.
- `src/pages/boqs/BoqEditor.tsx`, `src/pages/orders/OrderEditor.tsx`, `src/pages/pi/PiEditor.tsx`, `src/pages/purchase/PurchaseDetail.tsx`, `src/pages/requisitions/RequisitionDetail.tsx`, `src/pages/requisitions/AnnexureFolder.tsx`, `src/pages/manufacturing/ManufacturingDetail.tsx` — wrap existing cell renderers in `HighlightCell` (no other changes).

## Verification
- `bunx vitest run` (new + existing notification tests green).
- `tsgo` typecheck clean.
- Manual: edit 3 cells in a BOQ, save → exactly one BOQ-target-dept notification per linked dept with merge_count=3; clicking opens `/boqs/:id?notif=…` and the 3 cells show amber highlight with Old → New popovers; unrelated rows unchanged; actor sees nothing; non-target dept can't ack.

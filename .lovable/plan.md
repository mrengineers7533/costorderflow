## Goal

Guarantee: **one document save = one consolidated notification per related department**, with all changed item/field details inside that single notification's Details view. Scope strictly limited to the Notification system.

---

## What is already in place (from prior turns)

1. **Backend suppression flag** — `public.set_notif_suppress(boolean)` + early-return in `public.emit_notification` when `notif.suppress_cascade = 'on'`. Cascaded BOQ/PI/auto-BOQ writes do not emit their own notifications.
2. **Frontend cascade wrapping** in `src/lib/revisions/index.ts`:
   - `syncBoqsAndPisForOrder` wraps BOQ + PI sync and `reviseBoqFromOrder` with `withNotifSuppress`.
   - `createInitialBoqForOrder` wraps the auto-created BOQ insert.
   - `reviseOrder` wraps `createPendingBoqRevision`.
3. **Per-department fan-out** already collapses into a single `app_notifications` row with a `target_departments[]` array (handled inside `emit_notification`). One source event → one row → each department sees exactly one entry.
4. **Details view** (`NotificationDetailDialog.tsx`) already renders one row per changed item with red-highlighted changed cells and `Change in <Field>: Old value was X and new value is Y`, hiding unchanged items.

Net result today: one OA save (single or multi-field, single or multi-item) produces exactly one notification per related department, with all changes inside.

---

## Small remaining gaps to close in this plan

### A. Add a defensive consolidation guard in `emit_notification` (backend)

Even with suppression, a future code path that forgets to wrap a cascade could re-introduce duplicates. Add a same-actor + same source-row + same event-type + 5-second window dedupe:

- Before `INSERT INTO app_notifications`, check for an existing row in the last 5 seconds with the same `(source_table, source_row_id, event, actor_id)`.
- If found, **merge** instead of inserting: append the new `line_item_changes` diff entries into the existing row's `line_item_changes` jsonb array, refresh `updated_at`, and return. No new row, no new "unseen" badge bump.
- This is purely additive plumbing inside `emit_notification`; no trigger, RLS, schema, or other function is changed.

### B. Details view header label (frontend, `NotificationDetailDialog.tsx` only)

Above the line-items table, render a small label:

- `1 edit in this document` when the merged `line_item_changes` length === 1 and exactly one field changed.
- `N edits in this document` otherwise (sum of changed fields across all changed items, plus added/removed counts).

No other UI change. HeaderCard, StatusChipBar, "Header Fields Changed" section, Acknowledge button, Not-Seen badge, dashboard, data fetching, and every caller stay identical.

### C. Quick verification pass

- Edit 1 field on 1 OA item → 1 notification per related dept, label reads `1 edit in this document`, table shows that one row with red cell + sentence.
- Edit 3 fields across 2 items in one save → still 1 notification per dept, label reads `5 edits in this document` (or correct count), all changes visible.
- BOQ-only / PI-only / Purchase-only / Requisition-only / Design-only edits → unchanged, still one notification per related dept as today.
- Revised OA + auto BOQ generation → still one OA notification per dept; the auto-BOQ suppression already in place prevents a duplicate.

---

## Files touched

- `supabase/migrations/<new timestamp>_notif_consolidate_window.sql` — updates only `public.emit_notification` to add the 5-second same-event merge. No schema/RLS/trigger changes.
- `src/components/notifications/NotificationDetailDialog.tsx` — adds the "1 edit / N edits" label above the existing table.

## Out of scope (explicitly not changed)

OA/BOQ/PI/Design/Purchase/Manufacturing/Requisition screens, calculations, save logic, revised logic, auto-BOQ logic, PDFs/Excel, approvals, acknowledgement flow, RLS, any trigger other than `emit_notification`, sidebar, dashboard charts, data-saving logic.

## Acceptance

1. Any single document save (OA, BOQ, PI, PO, Requisition, Design status) produces **exactly one notification per related department**, even if the save cascades or fires multiple internal writes.
2. The Details view of that notification contains every changed item/field with old vs new clearly visible and the changed cells in red.
3. A clear `1 edit` vs `N edits` label appears above the items table.
4. Unchanged items remain hidden.
5. All existing module screens, calculations, approvals, acknowledgement, PDFs, and data persistence behave exactly as before.

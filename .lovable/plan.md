## Goal

Add a **Line Item Change History** card to the existing Notification Detail dialog (the page in the screenshot). It lists every field-level edit to line items, showing Item, Field Changed, Old Value, New Value, Edited By, Edited On. Only line items that actually changed appear.

No new tables, no triggers, no edits to Orders/BOQ/PI editors. Pure read-side aggregation over the data already stored in `app_notifications.line_item_changes`.

## Scope

- File touched: `src/components/notifications/NotificationDetailDialog.tsx` (one new component + one new query inside `load`).
- Nothing else changes — header card, Line Item Details table, Change Details, Status chip bar, acknowledgement flow all stay exactly as-is.

## How it works

1. **Fetch sibling history.** Inside the existing `load()`, after fetching the current notification, run one extra query:
   - If `notif.record_ref` is set → `select id, actor_user_name, actor_department, created_at, line_item_changes from app_notifications where record_ref = notif.record_ref order by created_at asc`.
   - Else fall back to `record_id = notif.record_id`.
   - Store in `history` state.

2. **Aggregate per line + field.** Walk every notification's `line_item_changes`:
   - For each `modified` change → emit one row per entry in `changed_fields` with `{ line_no, field, old: before[field], new: after[field], by, dept, when }`.
   - For each `added` change → emit one row `{ line_no, field: "Status", old: "—", new: "Added", by, when }`.
   - For each `removed` change → emit one row `{ line_no, field: "Status", old: "Present", new: "Removed", by, when }`.
   - Skip lines that produced zero rows. Sort rows by `line_no` then `when`.

3. **Render a new card** below "Change Details" and above the Status chip bar:

   ```
   Line Item Change History
   Item 1 — Edited 2 times
   ┌──────┬────────────────┬───────────────┬───────────────────────┬────────────┬────────────────────┐
   │ Item │ Field Changed  │ Old Value     │ New Value             │ Edited By  │ Edited On          │
   ├──────┼────────────────┼───────────────┼───────────────────────┼────────────┼────────────────────┤
   │ 1    │ Description    │ SD-10         │ SD-10 (F)             │ Ravi (BOQ) │ 15-Jun-2026 11:20  │
   │ 1    │ Make           │ M.R. Engg     │ M.R.Engg (Fowler …)   │ Ravi (BOQ) │ 15-Jun-2026 11:21  │
   └──────┴────────────────┴───────────────┴───────────────────────┴────────────┴────────────────────┘
   Item 13 — Edited 1 time
   ...
   ```

   - Group header per line_no with edit count.
   - Hide the entire card when the aggregated list is empty (no item ever changed).
   - Use the same `FIELD_LABELS` / `labelOf` helper already in the file for pretty field names.
   - Use existing `truncate` for long values.

## Technical details

- New state: `const [history, setHistory] = useState<NotifFull[]>([])`.
- Pass `history` into the body component and render `<LineItemChangeHistory history={history} />` after `<ChangeDetailsCard />`.
- `LineItemChangeHistory` is a small pure component inside the same file (consistent with the existing per-section components).
- Acknowledgement, real-time, and revision logic are untouched.

## Out of scope (explicitly not changing)

OA / BOQ / PI / Purchase / Manufacturing / Requisition / Annexure / Costing / Design calculation, approval flow, revision logic, notification write path, RLS, schemas, and any module page UI. Only the read-only history card on this one dialog.

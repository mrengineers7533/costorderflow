# Notification "Details" — Before/After row-style view

## Goal
Make the change clear at a glance: show each affected line item twice (Before Edit / After Edit) using a fixed header — S. No. | Description | HSN | Qty | Rate | Amount | Changes/Edit. Highlight only the changed cells in **red** on the After row, and describe each change in plain English in the **Changes/Edit** column.

Only the Details dialog UI changes. Acknowledge, Not-Seen Notifications, dashboard, and all underlying data/logging stay exactly as today.

## Scope
- File: `src/components/notifications/NotificationDetailDialog.tsx`
- No DB / migration / edge-function changes
- No changes to how `line_item_changes` are produced (current `before` / `after` / `changed_fields` payload already has everything needed)

## New "Line Item Changes" block (replaces the current line-item table in `ChangedLineItemsHistory`)

For every line item that appears in `line_item_changes` (across the current notification + sibling history, same as today), render a small 2-row table per item:

```
| S. No. | Description    | HSN    | Qty | Rate | Amount | Changes/Edit                                     |
| ------ | -------------- | ------ | --- | ---- | ------ | ------------------------------------------------ |
| 1      | Timing Belt R. | 545686 | 11  | 500  | 5500   | (empty on Before row)                            |
| 1      | Timing Belt R. | 545686 | 21  | 500  | 5500   | Change in Quantity: Old value was 11, new is 21. |
```

Rules:
- The header row is fixed and always rendered, even if some fields are missing (show "—").
- **Before Edit** row uses `change.before`; **After Edit** row uses `change.after`.
- On the After row, every cell whose key is in `change.changed_fields` is wrapped in `text-red-600 font-semibold` so only the actually changed value is red. Unchanged cells render normally.
- **Changes/Edit** column (After row only): one sentence per changed field, joined by line breaks, in the form
  `Change in <Label>: Old value was <old>, new value is <new>.`
  Use the existing `labelOf()` / `FIELD_LABELS` map so `qty → Quantity`, `rate → Rate`, `description → Description`, `hsn / hsn_code → HSN`, `amount → Amount`, etc. Add `hsn` / `hsn_code` → "HSN" to `FIELD_LABELS`.
- **Added** line items: render only the After row, all cells normal color, Changes/Edit = "New line item added.".
- **Removed** line items: render only the Before row, all cells in red strike-through, Changes/Edit = "Line item removed.".
- Compute `Amount` from `qty * rate` when the payload doesn't carry an explicit `amount` field (best-effort, falls back to "—").
- Field key resolution per column (tries first match found in the row object):
  - Description: `description`, `size_model`, `model`
  - HSN: `hsn`, `hsn_code`, `hsn_sac`
  - Qty: `qty`, `quantity`
  - Rate: `rate`, `unit_rate`, `price`
  - Amount: `amount`, `total`, computed `qty*rate`
- A cell is treated as "changed" if **any** of its candidate keys appears in `changed_fields`.
- Sorting/grouping: keep one block per `(notification, line_no)` pair, ordered by line number then chronological — same iteration order as today.
- Above each per-item table show a small subheader: `Item <lineNo> · edited by <name> (<dept>) · <timestamp>` so multi-edit history is still visible.

## Things that stay exactly the same
- "Header Fields Changed" table (top-level field edits) — unchanged.
- HeaderCard, StatusChipBar, Acknowledge flow, Acknowledge-as department select — unchanged.
- NotSeen Notifications badge logic, dashboard, activity feed — untouched.
- Data fetching, `line_item_changes` JSON shape, and all callers — untouched.

## Acceptance
- Opening Details for a notification with a Qty change shows two rows for that item; only the new Qty cell is red; Changes/Edit reads "Change in Quantity: Old value was 11, new value is 21.".
- Changing multiple fields on one item produces one Before row, one After row, multiple red cells, and one sentence per field in Changes/Edit.
- Added/Removed items render correctly with a single row.
- Header is always S. No. | Description | HSN | Qty | Rate | Amount | Changes/Edit.
- No regressions to acknowledge, not-seen badge, or any other feature.

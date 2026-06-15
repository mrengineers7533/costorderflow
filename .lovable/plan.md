## Goal

Replace the current "Change Details" card in the Notification Detail dialog so it shows **only line items that actually changed**, and lists field-level changes (old → new) **directly under each changed line item**, grouped by the parent record reference (OA / BOQ / PI).

## Scope

- File touched: `src/components/notifications/NotificationDetailDialog.tsx`
- Remove the old `ChangeDetailsCard` body (the before/after `DiffTable`, the field chips, the fallback grid) and the standalone `LineItemChangeHistory` card. Both are replaced by one new component: `ChangedLineItemsHistory`.
- Header card, `LineItemDetailsTable`, Status chip bar, acknowledgement flow, real-time logic — all untouched.
- Reuses existing data: current `notif.line_item_changes` + the already-fetched sibling `history: NotifFull[]` (no new tables, no new queries).

## New component: `ChangedLineItemsHistory`

Input: `notif: NotifFull`, `history: NotifFull[]`.

### Aggregation

1. Build a unified list of edits from every notification in `[notif, ...history]` (dedupe by `id`).
2. For each notification `h`, walk `h.line_item_changes`:
   - `modified` → for each `f` in `changed_fields`:
     - `oldV = before[f]`, `newV = after[f]`
     - **Skip if `JSON.stringify(oldV) === JSON.stringify(newV)`** (no real change)
     - Emit `{ line_no, field: f, oldV, newV, by, dept, when, recordRef: h.record_ref }`
   - `added` → emit `{ field: "Status", oldV: "—", newV: "Added", … }`
   - `removed` → emit `{ field: "Status", oldV: "Present", newV: "Removed", … }`
3. Group edits by `line_no`. **Drop any line that has zero edits** after the equality filter.
4. Within a line, sort edits by `when` ascending.
5. Sort lines by numeric `line_no`.

### Record reference line

At the top of the card, render a single reference string built from `notif.new_value`/`old_value` via the existing `pickStr` helper:

```
OA: OA-001   /   BOQ: BOQ-001   /   PI: PI-001
```

Only show the segments that have a value (skip missing ones).

### Per-line rendering

For each changed line item:

```
Line Item {line_no}                            Edited N time(s)
  Changed Cell: {labelOf(field)}
  Old Value: {truncate(oldV, 200)}
  New Value: {truncate(newV, 200)}
  Changed By: {by} ({dept})
  Changed At: {formatted when}
  ──────────────
  Changed Cell: {next field}
  ...
```

Use a label/value two-column layout per edit block (no big diff table), separated by a thin divider. Old value in red, new value in emerald, consistent with existing tokens.

### Empty state

If after filtering there are zero changed lines AND `changedTopFields(notif)` is also empty → render nothing (card hidden). If there are only top-level field changes (no line items), fall back to a small "Header fields changed" block listing those `old → new` rows (reuses current `fieldChips` idea but only for the top-level non-line-item case).

## Wiring

- In `NotificationDetailBody`, replace:
  ```
  <ChangeDetailsCard notif={notif} changes={lineChanges} />
  <LineItemChangeHistory history={history} />
  ```
  with:
  ```
  <ChangedLineItemsHistory notif={notif} history={history} />
  ```
- Delete `ChangeDetailsCard`, `DiffTable`, and `LineItemChangeHistory` (and the now-unused `ChevronsDown` import if nothing else uses it).
- Keep `changedTopFields`, `labelOf`, `truncate`, `pickStr`, `HIDDEN_FIELDS`, `FIELD_LABELS` — all reused.

## Out of scope

OA / BOQ / PI / Purchase / Manufacturing / Requisition / Annexure / Costing / Design editors, approval flow, revision logic, notification write path, RLS, schemas, header card, line-item details table, status chips, acknowledgement.

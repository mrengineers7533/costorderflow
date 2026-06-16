# Improve Notification Detail – Change Details section

Rework the **Change Details** block in `src/components/notifications/NotificationDetailDialog.tsx` so reviewers can immediately see *which line item* and *which field* changed, in two clearly separated tables. Existing design, header card, status chips, acknowledge flow, and all data sources stay exactly as today.

## What changes

Only the `ChangedLineItemsHistory` component (and its render inside `NotificationDetailBody`) is updated. No backend, no other screens, no notification creation logic.

### 1. Line Item Changes (table)

Render when at least one line-item edit exists across the merged history. Columns:

| Line Item | Item Name | Field / Option Edited | Old Value | Current Value | Edited By | Edited On |
|---|---|---|---|---|---|---|

- One row **per changed field** (multiple rows can share the same Line Item No., as in the user's example).
- `Line Item` = `Item {line_no}` (falls back to positional index, same logic as today).
- `Item Name` = `description` from `after` then `before`, falling back to `size_model` (reuses existing `pickStr`-style lookup already in the file).
- `Field / Option Edited` = `labelOf(field)` (uses existing `FIELD_LABELS` map; new keys like `rate`, `discount`, `tax`, `delivery_date`, `comment` rendered via title-case fallback).
- `Old Value` shown with strikethrough red, `Current Value` shown in emerald — matches current visual language.
- `Edited By` = `{actor_user_name} ({actor_department})`; `Edited On` = localized `created_at`.
- `added` / `removed` line items render as a single row with status pill in Field column (Added / Removed) and `—` for the missing side, preserving today's behavior.

### 2. Header Fields Changed (table)

Render whenever `changedTopFields(notif)` returns any keys — **always**, even if line item changes also exist (today it only renders as a fallback). Columns:

| Field Edited | Old Value | Current Value |
|---|---|---|

Same value formatting as today (`truncate`, red strike / emerald). Uses the existing `HIDDEN_FIELDS` filter and `_id` suppression so noise fields stay hidden.

### 3. Section header & record reference

Keep the existing `History` icon + "Change Details" title and the `OA / BOQ / PI` reference line so the user still sees which record was changed. Add sub-headings `Line Item Changes` and `Header Fields Changed` above each table.

### 4. Empty state

If neither table has rows (rare — e.g. only `_id` churn), render the existing fallback message area. The dialog stays view-only — no buttons, no inline edits.

## Out of scope

- No DB schema, no migrations, no RLS changes.
- No changes to how `app_notifications.line_item_changes`, `old_value`, or `new_value` are populated.
- No changes to `HeaderCard`, `StatusChipBar`, acknowledge UI, dashboard, list pages, or any other component.
- No changes to existing features anywhere else.

## Files touched

- `src/components/notifications/NotificationDetailDialog.tsx` (presentation only)

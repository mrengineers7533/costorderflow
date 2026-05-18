## Goal

Apply the same "save each revision as a snapshot + folder shows only latest + history visible from latest" pattern (already done for BOQ) to **OA (orders)**. No DB schema changes — the `orders` table already has `parent_order_id`, `revision`, and `is_current`, and a trigger that flips siblings to superseded on save. Each `reviseOrder()` already creates a fresh row, so revisions are already their own saved snapshots.

## Changes

### 1. `src/pages/orders/OrdersList.tsx` — folder shows only latest

- Flip default `showSuperseded` from `true` → `false` so the OA Folder loads with `is_current = true` only.
- The toggle stays available (admin/debug). Counts (`all`, `MR`, `GMS`) and BOQ/PI badges automatically reflect only current rows because they iterate `orders`.
- No change to delete logic, sort, columns, or actions.

### 2. New component `src/components/orders/OaRevisionHistory.tsx`

- Props: `currentOrder: OrderRecord`.
- Resolves the family root (`parent_order_id || id`), fetches all sibling orders, sorts numerically by `revision` ascending (R0, R1, R2, R3, R10 — no string sort).
- Renders a compact table with columns: **OA Number**, **Rev**, **Date**, **Created/Updated By** (from `prepared_by`), **Status**, **Current/Superseded** badge, **View** button.
- View navigates to `/orders/<that-id>`. The currently open row is highlighted and labeled "Viewing".

### 3. `src/pages/orders/OrderEditor.tsx` — wire the history + enforce read-only

- Add `<OaRevisionHistory currentOrder={...} />` directly below the existing `RevisionsPanel` (keep RevisionsPanel — it groups BOQs/PIs/Client Copies, separate concern).
- The amber "Superseded — newer revision exists" banner already exists. Add a one-click **"Open current revision"** link inside that banner.
- **Lock editing on superseded revisions**: in `save()` and `Finalize`, short-circuit with a toast if `!isCurrent && !isNew` and return early. Also disable the `Save Draft` and `Finalize` buttons in that state (`disabled={!isCurrent && !isNew}`).
- No change to `reviseOrder`, OA/BOQ/PI sync, formats, calculations, or permissions.

### 4. Sorting

- `OaRevisionHistory` sorts by numeric `revision asc`. `OrdersList` keeps `created_at desc` (unchanged) — it now only shows current rows so ordering is unambiguous per family.

## What is NOT changed

- No DB migration. `orders.parent_order_id`, `revision`, `is_current`, and `orders_keep_single_current` trigger are sufficient.
- No change to PDF/Excel exports, cost-sheet parsing, OA→BOQ sync, OA→PI sync, OA counters/numbering, deletion behavior, or permissions.
- Old revisions are not deleted, merged, or overwritten — only hidden from the main folder list and surfaced inside the latest OA page.
- BOQ folder logic (already shipped) stays as-is.

## Technical notes

- Family root resolution: `parent_order_id || id`. Fetch siblings with `.or(\`id.eq.<root>,parent_order_id.eq.<root>\`)`.
- "Created/Updated By" uses `prepared_by` (already a column). If empty, falls back to `—`.
- Read-only guard mirrors the BOQ editor pattern (`!isNew && !isCurrent`), so behavior is consistent across BOQ and OA.

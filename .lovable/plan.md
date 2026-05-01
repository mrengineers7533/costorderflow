# Item-wise PI generation from OA

## Overview

Today `createPiFromOa` copies all OA line items into a single PI. We change this so the user picks specific OA items, the PI contains only those, and already-converted items become locked with a visible "PI Done — <PI #>" badge.

## 1. Tracking which OA items are already in a PI

Each line item already has a stable `id` (string) on the OA. The PI's `line_items` are copies of selected OA items, preserving their original `id`.

To detect "already converted" we query all current PIs that reference the OA and collect `line_items[].id` → PI number. This is purely derived data, so:

- No schema migration is required for the basic feature.
- Optional small migration: store the source OA item id explicitly on each PI line item as `source_oa_item_id`. To be safe across copies/edits, we will set this at PI creation time but also fall back to matching by `id`.

We do not migrate the schema. We rely on the existing `id` on line items, which already round-trips through JSONB.

## 2. New helper: build OA item PI status map

New function in `src/lib/pi/convert.ts`:

```ts
export interface OaItemPiStatus {
  done: boolean;
  pi_number?: string;
  pi_id?: string;
}

export async function fetchOaItemPiStatus(
  oaId: string,
): Promise<Record<string /* oa item id */, OaItemPiStatus>>;
```

Logic:
- Fetch all `proforma_invoices` rows where `reference_oa_id = oaId` AND `is_current = true` AND `status != 'cancelled'` (status enum currently is `draft|finalized` — cancellation doesn't exist yet, so we just include all current PIs for now; the hook is in place for future cancel logic).
- Walk each PI's `line_items`, and for each item map `item.id → { pi_number, pi_id }`.
- Return the map.

## 3. New helper: createPiFromOaItems

Replace direct `createPiFromOa` call sites with a selective version:

```ts
export async function createPiFromOaItems(
  oa: OrderRecord,
  selectedItemIds: string[],
): Promise<PiRecord>;
```

Behavior:
- Filter `oa.line_items` to only those whose `id` is in `selectedItemIds`, preserving OA order.
- Re-run guard: re-fetch PI status map; if any selected id is already done, throw `"Item already in PI <number>"` (prevents race / duplicate).
- Allocate a fresh PI number via existing `next_pi_number` RPC (each call increments → unique number guaranteed).
- Build the PI insert row exactly like today, but with the filtered line items and recomputed totals.
- Insert + self-reference `parent_pi_id` (same as current logic).

Keep the existing `createPiFromOa` exported as a thin wrapper that selects all currently-pending items, so any call site we miss still works.

## 4. New UI: OA → PI item selection dialog

New file `src/components/pi/PiItemSelectDialog.tsx`. A `Dialog` with a `Table`:

| Select | Item Code | Description | Qty | Rate | Amount | PI Status | Related PI # |

Behavior:
- Opens with a summary row at the top: `OA <oa_number> · <pending count> pending · <done count> done`.
- Columns:
  - Select: checkbox; disabled when item is already done. A header checkbox selects/deselects all *pending* items.
  - Item Code: line item `hsn_code` (existing field) or fallback to row index `#1`, `#2`…
  - Description, Qty, Rate (`unit_rate`), Amount: from line item.
  - PI Status: badge — `Pending PI` (muted) or `PI Done` (success/green).
  - Related PI #: shows the PI number for done items, dash for pending.
- Footer:
  - Left: live totals for selected items (basic + estimated grand total).
  - Right: `Cancel` and `Generate PI` buttons. `Generate PI` is disabled until at least one pending item is selected.
- On confirm: call `createPiFromOaItems(oa, selectedIds)`, toast the new PI number, close dialog, navigate to `/pi/<id>`.

Loading state: while `fetchOaItemPiStatus` runs, show a spinner row.

## 5. Wire the dialog into existing entry points

Two places trigger "Convert to PI":

### `src/pages/orders/OrderEditor.tsx` (line ~333, ~476)
Replace the direct `handleConvertToPi` with: open `PiItemSelectDialog` with the loaded OA. The button text stays "Convert to PI".

### `src/pages/pi/PiList.tsx` (line ~101)
The "Create PI" flow on the PI list page also routes through the dialog. Fetch the OA, then open the dialog.

A small shared helper: keep dialog state local in each page (pattern matches existing dialogs in the codebase).

## 6. Edge cases & rules enforced

- **Unique PI number per PI**: guaranteed by `next_pi_number` RPC (already atomic via `oa_counters`-style upsert).
- **No duplicates**: server-side re-check inside `createPiFromOaItems` before insert.
- **All items done**: dialog shows an empty selectable set, "Generate PI" disabled, header reads "All items have PI generated".
- **OA revisions**: We use the OA passed in. Items added in a later OA revision get new ids (existing behavior) and naturally appear as pending until included in a PI.
- **PI revisions**: A PI revision keeps the same `base_pi_number`. Our status map only looks at `is_current = true`, so revisions don't double-count items.
- **Cancellation hook**: Status query already excludes future `cancelled` PIs (filter is in place; enum extension is out of scope for this change).

## 7. Files to create

- `src/components/pi/PiItemSelectDialog.tsx` — the selection dialog described above.

## 8. Files to edit

- `src/lib/pi/convert.ts` — add `fetchOaItemPiStatus`, add `createPiFromOaItems`, keep `createPiFromOa` as compatibility wrapper.
- `src/pages/orders/OrderEditor.tsx` — open dialog instead of calling `createPiFromOa` directly.
- `src/pages/pi/PiList.tsx` — same: open dialog from "Create PI from OA" action.

## 9. Acceptance check (manual)

1. OA with 5 items → click Convert to PI → dialog shows 5 pending → select #1,#2,#3 → generate → new PI has 3 items, number e.g. `MRPI/2026-27/001`.
2. Reopen Convert to PI on the same OA → dialog shows #1–#3 as `PI Done — MRPI/2026-27/001` (disabled) and #4–#5 pending → select both → generate → new PI `MRPI/2026-27/002` with 2 items.
3. Reopen → all 5 marked done with their PI numbers, "Generate PI" disabled.
4. PI numbers are sequential and unique across both PIs.

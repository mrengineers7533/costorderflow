# Client Copy ↔ Main OA Linking

## Goals (from your answers)

1. **Grouping option, default OFF** — by default Client Copy items = main OA items (item-wise with individual prices). User can toggle grouping ON to collapse MHE / Spouting / Fan / Magnet rows the old way.
2. **Live-linked** — Client Copy has no separate editor. It always reflects the current main OA (items, prices, charges, totals). Saved Client Copy PDFs remain in OA Version History as snapshots.
3. **PI from Client Copy** — Generate PI uses Client Copy items (so grouping toggle, if ON, affects PI too). BOQ continues to come from main OA.

## Behaviour

- **Editing**: All edits happen on the main OA editor (existing UI). No separate Client Copy editor.
- **Client Copy preview / PDF / Excel**: Built on-the-fly from the current OA state by passing items through `buildClientCopyItems({ grouped })`. With grouping OFF the function is a passthrough — every item shows with its own description, qty, rate, amount, make, exactly like main OA.
- **Grouping toggle**: A single checkbox in the OA editor header (next to "Create Client Copy"): *"Group MHE / Spouting / Fan / Magnet in Client Copy"*. Persists on the order row so it survives reloads and revisions.
- **Calculations**: Client Copy uses the same `calcTotals` / Turkey / Murthal / CIF calc chain as the main OA, on the (possibly grouped) item list. Charges, GST, discount, advance, net payable — all identical to main OA when toggle is OFF.
- **PI generation** (`createPiFromOrder`): Apply `buildClientCopyItems(items, { grouped: oa.client_copy_grouping })` before inserting PI line_items. All downstream PI math stays the same.
- **BOQ**: Unchanged — keeps using main OA items.

## Files to change

- `src/lib/orders/clientCopy.ts` — change signature to `buildClientCopyItems(items, opts?: { grouped?: boolean })`. When `grouped !== true`, return items unchanged (no MHE/SPOUTING/FAN/MAGNET collapsing, no `passMap` consolidation). When `true`, keep current grouping logic.
- `src/pages/orders/OrderEditor.tsx`
  - Add `clientCopyGrouped` state, load from `order.client_copy_grouping`, save on every order save.
  - Add a small checkbox/toggle in the action bar.
  - `downloadClientCopy()` → call `buildClientCopyItems(items, { grouped: clientCopyGrouped })`.
- `src/components/orders/OrderPreview.tsx` (if it has a Client Copy preview tab) — same pass-through with the toggle.
- `src/lib/orders/clientCopyExcel.ts` — same pass-through.
- `src/lib/pi/convert.ts` (`createPiFromOrder`) — import `buildClientCopyItems`, transform `filteredItems` before insert using `oa.client_copy_grouping`.
- `src/lib/orders/types.ts` — add `client_copy_grouping?: boolean` on `OrderRecord`.
- **DB migration**: `ALTER TABLE public.orders ADD COLUMN client_copy_grouping boolean NOT NULL DEFAULT false;` Also copy this flag forward when a revision is created (check `snapshotOrder` / revision insert paths).

## Out of scope

- No separate Client Copy editor (per your "live linked" choice).
- No automatic regeneration of already-saved Client Copy PDFs in history — those stay as historical snapshots. Generating a new one always uses current OA state.
- BOQ flow is untouched.

## Open detail to confirm before I build

Should the **existing saved Client Copy records** (rows in `client_copies` for past OAs) be left as-is (recommended — they are point-in-time PDFs), or do you want a one-time backfill that regenerates them with grouping OFF?

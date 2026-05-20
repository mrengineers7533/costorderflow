## Goal

When a Cost Sheet is parsed and applied to an Order Acceptance (OA), the system should automatically save the OA to the database — no manual "Save" click required. After a page refresh or reopening the page, the applied Cost Sheet data must still be there.

## What happens today

- **New OA (`/orders/new`)** — Parsed data is held in memory plus a `sessionStorage` cache (`oa-draft-extracted`). The OA row is created in the database only when the user clicks **Save**. A hard refresh recovers via session storage, but closing the tab / logging out loses everything.
- **Existing OA (`/orders/:id`)** — `CostSheetPicker` applies parsed data to the on-screen state, but nothing is written to the database until the user clicks **Save**.

## What will change

A new auto-save trigger fires the moment `applyCostSheet(...)` finishes, in both flows:

1. **New OA flow** — After apply, schedule an auto-save (~600 ms debounce so all derived state — items, totals, format — settles first). The existing `save(false)` path:
   - allocates an OA number via `next_oa_number` RPC,
   - inserts the order row,
   - clears the `oa-draft-extracted` session cache,
   - navigates to `/orders/<new-id>`.
   From that point on the URL points to the persisted record, so refresh / reopen reload from the DB.

2. **Existing OA flow** — After apply, call the existing `scheduleAutoSave()` so the updated `line_items` / charges / addresses are persisted via `save(false)` → `orders.update(...)`. This already runs `syncBoqsAndPisForOrder` afterward, matching the manual save behaviour.

3. **Guards** (do not change any existing behaviour):
   - Skip auto-save if the OA is a read-only / superseded revision (`isCurrent === false`).
   - Skip if a save is already in flight (`saving` flag).
   - Skip if `applyCostSheet` was called with empty data.
   - Keep the session-storage cache exactly as-is — it still covers the tiny window between "apply" and "insert completes" on the new-OA page.

4. **User feedback** — Reuse the existing toast from `save(false)` ("OA data saved successfully …"). No new UI.

## Files touched

- `src/pages/orders/OrderEditor.tsx`
  - `applyCostSheet(...)`: at the end, call `scheduleAutoSave()` (the debounced wrapper that already exists for design-Apply auto-saves).
  - The router-state / sessionStorage recovery effect that calls `applyCostSheet` on mount will therefore also trigger the auto-save, so a Cost Sheet that was just applied on `/orders/new` is persisted within ~½ second and the URL flips to `/orders/<id>`.
  - Add a small `savingRef` / `appliedOnceRef` guard so the auto-save can't loop.

## Out of scope (explicitly unchanged)

- Manual **Save** button, **Save & Finalize**, revision flow, BOQ / PI sync — all untouched.
- Cost-sheet parsing edge function, storage bucket, and DB schema — untouched.
- Workflow page matching, OA revision history, per-item change history — untouched.
- No DB migration.

## Goal
Per-item revision history must show **every** revision (R0, R1, R2…) row-wise, with old value, new value, and price difference for each changed field. The button must be available on both OA and BOQ item rows.

## Changes

### 1. `src/components/orders/ItemChangeHistoryButton.tsx` — show all revisions
Currently the dialog skips revisions where nothing on this item changed. Update the `events` builder so it emits one card per revision in the family:
- **R0** — render as "Initial values in R0" with the full field snapshot (no previous column, just Current Value), and the row's starting amount.
- **R1, R2, …** — for each revision, always emit a card titled `Revised in R{n} (R{n-1} → R{n})`:
  - If the item changed, list each changed field as `Field | Previous | Updated` (already implemented), plus the price-impact footer (`+₹x / OA increased by …` — already implemented).
  - If the item is unchanged, show a single muted line "No changes to this item in R{n}" so the revision is still visible.
  - If the item was removed in R{n}, keep the existing "Removed" card.
- Keep the header counters (`N changes across M revisions`) and existing styling.
- No behavioral change to data fetching, matching by `keyOf`, or to the `ItemChangeHistoryButton` props.

### 2. `src/pages/boqs/BoqEditor.tsx` — add the same button per BOQ row
Add a `BoqItemChangeHistoryButton` (small new component, or generalize the existing one) that:
- Fetches the BOQ family the same way OA does — `from("boqs").select("*").or("id.eq.<root>,revised_from_id.eq.<root>")` and walks the chain via `revised_from_id` to assemble the full R0…Rn list ordered by `revision`.
- Reuses the same dialog shell, but lists BOQ fields: **Item No, Model Number, Description, Quantity, Unit, Remarks** (no Rate/Amount/Make — BOQ has no pricing).
- Renders below each BOQ row in `BoqItemsList`, mirroring how the OA editor places it under the row.
- Only shown when the current BOQ has a parent in the family (i.e. there is at least one prior revision); for a brand-new R0 BOQ it still opens and shows the R0 snapshot.

To avoid duplicating the dialog, factor the rendering into a shared `ItemChangeHistoryDialog` helper that accepts:
```
{ title, fields: {key,label,kind}[], snapshots: { rev, item }[] }
```
and is consumed by both the OA wrapper and the new BOQ wrapper. Pricing-aware logic (rate/amount/delta footer) is gated behind a `showPriceImpact` flag so BOQ cards skip it.

### 3. No other changes
- No edits to revision creation, BOQ ↔ OA sync, pricing, totals, save flow, RLS, or any existing UI/feature.
- No DB schema changes.

## Verification
1. Open an OA with 2+ revisions → click **View Change History** on an item: a card appears for R0 (initial snapshot), then one card per subsequent revision; modified revisions show field-level Previous/Updated and the price-impact footer; unchanged revisions show "No changes to this item in R{n}".
2. Repeat for an item that was added later (no card before its insertion revision) and an item that was removed (Removed card at the right revision).
3. Open a BOQ with 2+ revisions → click the new **View Change History** on an item: same behavior using BOQ fields only (no Rate/Amount).
4. Confirm OA save / revise / BOQ auto-revise, PDF, pricing, and design-comments rows behave exactly as before.

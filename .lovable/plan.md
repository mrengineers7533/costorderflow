# OA-Driven BOQ & PI

## New Rule
- Only OA can be revised. BOQ and PI no longer have their own revisions.
- BOQ and PI always read live data from the linked OA.
- If OA changes, linked BOQ and PI auto-update.
- BOQ: same template, only Description editable per line. Remarks stay as today (already preserved); model/qty/unit/etc come from OA.
- PI: identical to OA for items, charges, taxes, totals. Only Advance Adjustment is editable.
- Multiple partial PIs per OA still allowed (existing item-selection flow).

## Changes

### BOQ
- Remove BOQ "Revise" UI/actions and `reviseBoqFromOrder` standalone calls.
- BOQ editor: lock everything except line-item Description (and Remarks, kept as-is). Items list is rebuilt from the parent OA on open.
- On OA save: for every BOQ linked to this OA family, refresh `line_items` from latest OA — preserve `description` overrides + `remarks` matched by model/original-description key.
- BOQ PDF/print continues to use the BOQ row (now auto-synced).

### PI
- Remove PI "Revise" UI/actions and standalone PI charges/discount editing.
- PI editor: charges, line-item prices, discount, tax, totals = read-only mirror of OA. Only `advance_mode` + `advance_amount` / `advance_adjustment_percent` editable.
- On OA save: for every current PI linked to this OA, refresh `line_items` (only the subset originally selected, matched by item id) + `charges` + recompute `totals` (preserving the PI's advance fields).
- Keep `createPiFromOaItems` (partial PIs) as-is.

### OA
- After successful OA save in `OrderEditor`, run a sync step:
  - Update each linked BOQ row.
  - Update each linked current PI row.
- Keep OA revision flow; drop the auto-BOQ-revision side-effect (no longer needed since BOQs auto-sync to current OA).

### Files touched
- `src/lib/revisions/index.ts` — drop BOQ revision branch; export `syncBoqsForOrder`, `syncPisForOrder`.
- `src/lib/pi/convert.ts` — remove `createPiRevision`; add `syncPiFromOa`.
- `src/lib/boq/types.ts` / sync helper — add `syncBoqFromOrder`.
- `src/pages/orders/OrderEditor.tsx` — call sync helpers after save.
- `src/pages/boqs/BoqEditor.tsx` — lock fields except Description; remove revise button; rebuild items from OA.
- `src/pages/pi/PiEditor.tsx` — lock everything except Advance Adjustment; remove revise button; mirror OA data on load.
- `src/pages/boqs/BoqList.tsx`, `src/pages/pi/PiList.tsx`, `src/components/orders/RevisionsPanel.tsx` — hide BOQ/PI revise actions.

## Notes
- Existing historical BOQ/PI revision rows remain in DB untouched (no destructive migration).
- "is_current" stays true for the latest row per family; older revision rows are simply not editable.

Make the **Qty** column editable on the "Convert OA to PI — Select Items" dialog so partial PIs can be raised by either quantity or amount. Qty and PI Amount stay linked (Amount = Qty × Rate) and both honor the remaining balance from previous PIs.

### Scope
- Only the MR flow in `src/components/pi/PiItemSelectDialog.tsx` (GMS qty-based flow already supports Qty edit).
- No changes to PDF/Excel/BOQ/calculations or Client Copy grouping logic.

### UX behavior
- **Qty** cell in MR becomes an `<Input type="number">` (was a static read-only "1 Set" / "1 Nos").
- Default value (when row is checked) = full balance qty (= balance amount / unit rate).
- Editing **Qty** → auto-updates **PI Amount** = qty × unit rate.
- Editing **PI Amount** → auto-updates **Qty** = amount / unit rate.
- Validation: qty must be > 0 and qty × rate ≤ balance amount (+ small epsilon). Invalid rows mark both inputs with `border-destructive` and disable Generate.
- Pure passthrough rows (non-grouped, qty already 1) work the same — user can enter fractional qty if needed.
- Disabled when row is unchecked or fully PI'd (status = Done).

### Technical changes (single file)
`src/components/pi/PiItemSelectDialog.tsx`:
1. Replace single `qtyMap` (which in MR currently stores amount strings) with two linked maps: `qtyMap` (qty string) and `amtMap` (amount string). For MR, editing one writes both so the values stay in sync; for GMS keep current single-map qty behavior.
2. Render an editable `Input` in the **Qty** column for MR rows (keeping unit suffix label like "Set"/"Nos" next to it).
3. `onChange` handlers:
   - Qty input → `amt = qty * unit_rate`; update both maps.
   - Amount input → `qty = amt / unit_rate` (guard rate=0); update both maps.
4. `piAmountFor` / new `piQtyForMR` read from the maps; balance check uses amount as today (`balanceAmtFor`).
5. `hasInvalidQty` / per-row `invalid` for MR uses amount-vs-balance (unchanged).
6. `handleGenerate` for MR keeps passing `amountOverrides` to `createPiFromOaItems` — no change in `convert.ts` needed since qty is derived from amount there already.

### Out of scope
- No DB/migration changes.
- No changes to `convert.ts`, `clientCopy.ts`, PDF, Excel, or PiEditor.
- GMS flow unchanged (already supports Qty edit).

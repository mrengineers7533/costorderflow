## Goal
On `/requisitions/plan`, display all quantity values with exactly 2 decimal places across the three tabs — Generated Requisition, Raw Materials, Annexure Reports. Lot Number stays untouched. No calculation, storage, or report-logic changes.

Formatting rule (truncate to 2 decimals, not round-half-up as banker's):
- `10` → `10.00`
- `10.5` → `10.50`
- `10.567` → `10.57`

This is `Math.trunc(n * 100) / 100` then `.toFixed(2)`. Empty / null / non-numeric stays as the current placeholder (`"—"`).

## Scope (single file)
`src/pages/requisitions/RequisitionPlan.tsx` only. Add one small local helper and use it at the display sites listed below. Nothing else changes.

### Helper
```ts
const fmtQty2 = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (Math.trunc(n * 100) / 100).toFixed(2);
};
```

### Display sites to update

1. **Generated Requisition tab**
   - Line ~610 `fgQty` fallback text → `fmtQty2(g.item?.quantity)`
   - Line ~649 FG Qty `<Input defaultValue>` → `fmtQty2(g.item.quantity)` when value is present (keep empty string when null so the field stays blank/editable)
   - Line ~679 RM Qty `<Input defaultValue>` → `fmtQty2(r.required_qty)` when value is present (else `""`)
   - `onBlur` parsing logic stays unchanged so user input like `10.567` still saves the raw numeric value; only the displayed default formats it.

2. **Raw Materials tab**
   - Line ~833 `{c.total}` → `{fmtQty2(c.total)}`

3. **Annexure Reports tab**
   - Line ~978 `{r.total_qty ?? "—"}` → `{fmtQty2(r.total_qty)}`
   - Line ~997 grand-total `{total}` → `{fmtQty2(total)}`

### Explicitly NOT changed
- Lot Number inputs / displays (lines ~706, ~837, ~973).
- PDF generation (`downloadReportPdf`, line ~532) — user said "reports should not be changed".
- Database writes, autosave, consolidation math, annexure creation, status logic.
- Any other page or component.

## Verification
- Manually render the three tabs; confirm quantities show `X.YY` and Lot column is unchanged.
- Editing an FG Qty / RM Qty still saves; on re-render the value reflects formatted default.
- Run `bunx vitest run` to ensure no existing tests regress (none target this file's display).

I’ll fix the remaining MR/GMS charge bleed by making the active company for charges unambiguous everywhere in the editor.

## What I will change

1. **Make the MR/GMS company switch control the charge panel too**
   - The line-items MR/GMS toggle currently only filters the table; it does not switch the active `format` used by Charges & Totals.
   - I’ll update it so choosing **MR** or **GMS** also switches the active OA format, preview, PDF, and charge state together.
   - Selecting **All** will only show all items, but charges will still clearly belong to the current active format.

2. **Use one shared format-switch helper**
   - The top Format dropdown, live preview MR/GMS buttons, and line-item MR/GMS toggle will all call the same helper.
   - This prevents one part of the page showing MR while the charges are still editing GMS, or vice versa.

3. **Keep charge updates locked to the selected company**
   - P&F %, Insurance %, Sea Freight %, GST %, Discount, Custom, Clearing, Landed GST, Currency, FX, Advance %, and every toggle will update only:
     - `chargesMr` when active format is MR
     - `chargesGms` when active format is GMS
   - I’ll make the setter use functional updates so rapid typing/clicking cannot accidentally reuse the wrong charge object.

4. **Show GMS landed-cost panels only for GMS**
   - The **Foreign Currency** and **Ex-works Murthal (Landed Cost)** panels are GMS-specific.
   - I’ll wrap them so they only appear/edit when active format is **GMS**.
   - MR will keep only its standard Charges & Totals fields.

5. **Keep save/load/PDF behavior independent**
   - MR values will continue saving to `charges`.
   - GMS values will continue saving to `charges_gms`.
   - PDF export will continue using the active company’s own charge block.
   - No database change is needed.

## Acceptance check after implementation

- Set MR P&F % to `1`.
- Switch to GMS using any MR/GMS control.
- GMS P&F should not become `1`; it should show its own value.
- Set GMS P&F % to `2`.
- Switch back to MR; MR should still show `1`.
- Same behavior for Insurance %, Sea Freight %, GST %, Discount, Custom %, Clearing %, Landed GST %, FX, Advance %, and all toggles.
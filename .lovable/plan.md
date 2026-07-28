# Vendor Templates — download & bulk upload

Add one new Admin page that hosts both Excel templates (Vendor Master and Vendor Item Master), with download and upload in the same place.

## New page

- Route `/admin/vendor-templates`, added to the admin tab bar as **Vendor Templates** (next to Vendors / Vendor Item Master).
- Two cards on the page:
  1. **Vendor Master** — Download template / Upload filled file
  2. **Vendor Item Master** — Download template / Upload filled file
- Each card shows the expected columns and a short instruction list.

## Templates (generated client-side with the existing `xlsx` library, same style as the Requisition template)

**Vendor_Master_Template.xlsx** — sheet "Vendors" + "Instructions"
Columns: Name*, Categories (comma separated: steel / machine / 3p)*, GSTIN, State Code, Address, Contact Person, Phone, Email, Payment Terms, Active (Yes/No)

**Vendor_Item_Master_Template.xlsx** — sheet "Vendor Items" + "Instructions"
Columns: Vendor Name*, Material*, Size/Model, UOM, Price, Preferred (Yes/No), Active (Yes/No), Notes

Both include 2–3 sample rows and column widths.

## Upload behaviour

- Accepts `.xlsx` / `.xls`, parsed in the browser; headers matched case-insensitively, extra columns ignored.
- Validation before writing: required fields present, price numeric, categories limited to steel/machine/3p, Yes/No fields parsed loosely.
- Preview step: a dialog lists rows to be **created**, rows to be **updated**, and rows **skipped with reasons**; nothing is written until the user confirms.
- Matching rules for update-vs-create:
  - Vendors: match on Name (case-insensitive).
  - Vendor items: match on Vendor Name + Material + Size/Model (case-insensitive).
- Vendor items resolve `vendor_id` from an existing vendor with the same name; if no vendor exists the row is skipped with a clear reason (so the user uploads Vendors first).
- Result toast + a summary table of created/updated/skipped counts after the run.

## Technical notes

- New files: `src/pages/admin/AdminVendorTemplates.tsx`, `src/lib/vendors/templates.ts` (template builders + parser/validator).
- Route registered in `src/App.tsx` under the existing admin/RequireAdmin wrapper; tab added in `src/components/admin/AdminTabs.tsx`.
- Writes go through the existing `vendors` and `vendor_item_prices` tables via the current client — no schema change, no migration, no change to existing add/edit dialogs or downstream pricing logic.

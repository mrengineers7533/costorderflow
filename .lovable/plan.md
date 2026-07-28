## Goal
Make both masters fully maintainable after upload: per-record Edit and Delete (with confirmation), and an Excel import that never fails as a whole because of blank optional data or one bad row.

## 1. Vendor Master (`src/pages/admin/AdminVendors.tsx`)
- Fix the edit form so uploaded vendors can be corrected:
  - Replace the three fixed category checkboxes (Steel / Machine / 3P) with a free-text "Categories" field (comma separated), matching what the Excel upload accepts.
  - Remove the "Pick at least one category" block — only Name stays mandatory; every other field may be saved blank.
- Add a Delete button per row, using the existing confirmation dialog component (`ConfirmBulkDeleteDialog`) with the vendor name shown. Keep the existing Active/Inactive toggle unchanged.
- On delete, if the database rejects it because the vendor is referenced by purchase orders/prices, show a clear message suggesting deactivation instead — no cascade, no data loss.

## 2. Vendor Item Master (`src/pages/admin/AdminVendorItems.tsx`)
- Keep the existing Edit dialog; make Vendor selectable by existing vendor OR free text (so item rows whose vendor was typed manually can still be edited), and allow Price to remain blank and be filled later.
- Load `notes` into the edit form (today it always resets to empty and would wipe remarks on save).
- Replace the browser `confirm()` delete with the same styled confirmation dialog used elsewhere.

## 3. Import robustness (`src/lib/vendors/templates.ts`, `src/pages/admin/AdminVendorTemplates.tsx`)
- Parsing:
  - Vendor rows: only Name is mandatory. Blank optional fields import as blank (not skipped, not overwritten with junk).
  - Vendor item rows: only Vendor Name + Material mandatory; blank Price, UOM, Size/Model, Notes are allowed.
  - A non-numeric Price becomes a row-level skip reason, never a file-level failure.
  - Count total data rows so the summary can report them.
- Applying the plan:
  - Insert/update **row by row** instead of one bulk insert, so a single failing row is recorded and the rest still import.
  - Blank optional cells on update do not erase existing values (only provided values overwrite) — protects already-entered data.
- Import summary dialog after apply, showing: Total rows, Imported (created), Updated, Skipped/failed, and a row-wise list of reasons. Downloadable as text is not included unless you want it.

## Unchanged
Purchase, Requisition, Annexure, pricing/auto-fill logic, calculations, permissions, notifications and all workflows stay exactly as they are. No migration and no changes to existing stored data.

## Technical notes
- Files touched: `src/pages/admin/AdminVendors.tsx`, `src/pages/admin/AdminVendorItems.tsx`, `src/pages/admin/AdminVendorTemplates.tsx`, `src/lib/vendors/templates.ts`, reuse of `src/components/common/ConfirmBulkDeleteDialog.tsx`.
- Deletes use existing table policies on `vendors` / `vendor_item_prices`; no schema or RLS change.

## Goal
Vendor Item Master Excel upload should never drop a row. Every Excel data row gets saved — good rows as usable prices, problem rows as **Pending / Incomplete** records that carry the exact reason and the original Excel data, editable later.

## 1. Database (one migration)
Add to `vendor_item_prices`:
- `import_status` — `ok` (default) / `pending` / `error`
- `import_issues` — list of reasons (e.g. "Vendor not found", "Price missing", "Invalid price format", "Duplicate vendor-item combination")
- `source_row` — the original Excel row as-is, plus `source_row_no` (Excel line number) and `source_file` (file name)
- Relax the "must not be blank" rule on Material and Vendor Name so an incomplete row can still be stored (existing rows unaffected).

Pending rows are saved as **inactive**, which is exactly what the existing pricing/auto-fill logic already ignores — so Purchase, Requisition, Annexure, vendor selection and calculations behave exactly as today.

## 2. Parsing (`src/lib/vendors/templates.ts`)
- No row is ever "skipped". Each non-empty row returns a record plus a list of issues.
- Issues detected: Vendor Name missing, Material missing, Price missing, Invalid price format, Unit/Size not matched to the vendor's existing entry, Duplicate vendor-item combination inside the same file.
- Original row values are kept verbatim for later correction.

## 3. Import apply (`src/pages/admin/AdminVendorTemplates.tsx`)
- Review dialog now shows three buckets: **Will import (valid)**, **Will import as pending (needs correction)**, **Errors** — nothing labelled "skipped".
- "Vendor not found" becomes a pending reason, not a skip; the typed vendor name is preserved so it can be linked after the vendor is added.
- Row-by-row insert/update as today; if the database itself rejects a row, it is retried as an `error` record holding the original Excel row, so the data is still never lost.
- Summary dialog shows: Total Excel rows, Successfully validated, Imported as incomplete/pending, Rows requiring correction, and the row-wise reason list (with Excel row numbers).

## 4. Vendor Item Master page (`src/pages/admin/AdminVendorItems.tsx`)
- New **Import status** badge column: Valid / Pending / Error, with the reasons shown on hover.
- Filter chips: All / Valid / Needs correction.
- Edit dialog gains a read-only "Original Excel row" panel and a **Mark as valid** action: on save, if Vendor, Material and a numeric Price are present, the row is set to `ok` + active and issues are cleared; otherwise it stays pending with refreshed reasons.
- Existing Add / Edit / Delete / Preferred / Active behaviour is unchanged.

## Unchanged
Vendor Master, Purchase, Requisition, Annexure, vendor selection, pricing rules, calculations, permissions, notifications, workflows, and all existing stored data.

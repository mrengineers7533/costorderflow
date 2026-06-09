## Problem

On `/raw-materials`, uploading an Excel file shows the red toast:
**"No rows parsed — Could not detect FG / Raw Material columns."**

Root cause is in `src/pages/RawMaterialMaster.tsx` → `parseSheet()`:

1. Header row is searched only in the **first 6 rows**. Many BOM sheets have a title block / logo / merged cells pushing the real header down to row 7–15.
2. Header detection requires a cell that matches `/raw\s*material/i`. Sheets that label the column simply **"Material"**, **"Description of Material"**, **"Item"**, or **"Particulars"** are rejected.
3. When detection fails the toast gives no hint of *why* (which sheet, what headers were seen), so the user can't self-diagnose.

The upload history in the screenshot proves the same logic *does* work for some files (24 FG, 565 RM rows imported) — so we only need to widen detection, not rewrite it.

## Scope (only this file)

`src/pages/RawMaterialMaster.tsx` — `parseSheet()` only. No DB / schema / UI / other-flow changes.

### Changes

1. **Wider header scan window**
   - Search first **25 rows** (was 6) for the header row.

2. **More header synonyms for the Raw Material column**
   Accept any of (case-insensitive, trimmed):
   - `raw material`, `raw materials`
   - `material`, `material name`, `material description`, `description of material`
   - `item`, `item name`, `item description`
   - `particulars`, `description`
   Pick the **leftmost** matching cell so a stray "material code" column doesn't win over the real one.

3. **Stricter header-row confirmation**
   To avoid matching a stray cell, the candidate row must also contain at least one of: `qty`, `reqd`, `required`, `unit`, `size`, `model`, or `make`. Otherwise keep scanning.

4. **Better failure toast**
   When no sheet yields rows, replace the generic message with:
   `"Could not detect header row in: <sheet names>. Expected a row with 'Raw Material' (or Material/Item/Particulars) plus Qty/Unit."`
   Also keep the existing `console.info("[RM parser] headers:", …)` so devs can inspect what was actually seen.

### Unchanged

- Column-A FG grouping, `firstLine()` model key, `qty_per_unit` / `reqd` fallback, `make`/`size`/`unit` resolution relative to Material column.
- Upsert into `fg_raw_material_map`, upload-history insert, admin gate, all UI, all toasts on success, edit / view / delete flows.
- The earlier multi-file work in `AdminRawMaterials.tsx` is untouched.

## Acceptance

- File `BOM 04 Jun. RECEIVE DATA FROM AMIT SIR FACTORY.xlsx` continues to import (24 FG / 565 rows).
- A BOM file whose header is on row 8–20 imports successfully.
- A BOM file whose column is labelled "Material" / "Description of Material" / "Particulars" imports successfully.
- A truly malformed file shows the new descriptive toast naming the sheets that failed.

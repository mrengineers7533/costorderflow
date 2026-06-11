## Goal

On **Purchase Material** (`/purchase/materials`), restore the full PO line editor that's currently missing and add support for ad-hoc custom items. Vendor selection, tax, calculations, and add/delete controls must all be reachable before clicking **Create PO**. No changes to other PO logic (PO numbering, DB schema, PDF, cancellation flow, Annexure→PO page).

## Scope

Only `src/pages/purchase/PurchaseMaterial.tsx` is edited. No DB migrations. No changes to `PoCreateFromAnnexure.tsx`, `PoFolder.tsx`, `poPdf.ts`, requisitions, or annexures.

## What gets restored / added

### 1. Per-row inputs in the Raw materials table
Add 4 editable columns to each row (disabled when row is not selected or already has a PO):
- **Due On** (date)
- **Rate** (number)
- **Disc %** (number, default 0)
- **GST %** (number, default 18)
- **Line Amount** (read-only, computed)

Keep the existing Lot / Category / Material / Size / Make / Qty / Unit / PO columns intact. Qty stays editable inline for selected rows.

### 2. Item add / delete
- **"+ Add custom item"** button above the table. Opens a small inline row with: Lot (dropdown of selected lots, or free text), Category (required, drives which vendor it uses), Material, Size, Make, Unit, Qty, Rate, Disc%, GST%, Due. Stored in component state only — inserted as a `purchase_order_rows` line with `raw_material_id: null` at PO creation. Multiple custom items allowed.
- **Delete** (trash icon) on each custom-item row. Annexure-sourced rows can only be deselected, not deleted (preserves traceability).

### 3. Vendor + tax block (already present, polished)
Vendor cards per required category remain. Add a small per-category summary line showing **Basic / Tax / Grand** for that category so the user sees the math before submitting. Tax % is per-row (GST column); the per-category totals roll up from row inputs + custom items.

### 4. Totals footer
Sticky footer summary: Selected rows · Subtotal · Tax · Grand Total — updates live as rate/disc/gst/qty change.

### 5. Create PO behavior (unchanged logic, extended payload)
- One PO per category (existing behavior).
- Validation now also requires `rate > 0` on every selected row (annexure + custom).
- Custom items are inserted into `purchase_order_rows` with `raw_material_id: null`; no update to `requisition_raw_materials` for them. Annexure-sourced rows still get `po_status='created'` + `po_id` as today.
- PDF generation already accepts arbitrary rows — custom items flow through unchanged.

## Out of scope

- No changes to PO numbering RPC, cancellation, send-PO, or PDF layout.
- No changes to Annexure → PO page (already has these controls).
- No DB schema or RLS changes (`purchase_order_rows.raw_material_id` is already nullable in the existing flow path).
- No changes to vendor combobox, settings, or buyer block.

## Technical notes

- Extend the existing `rates` state to `meta` keyed by row id: `{ rate, discount, gst, due, qty? }`. Custom items live in a separate `customRows` array with the same fields plus `lot_no`, `category`, `material`, etc.
- `selectedRowList` becomes `selectedRows + customRows` grouped by category for the per-PO insert loop.
- Reuse `generatePoPDF` and `next_po_number` RPC exactly as today.
- Guard custom items: require `category`, `material`, `qty > 0`, `rate > 0` before allowing PO creation.

## Verification

- Select annexure rows → enter rate/disc/gst → totals update; Create PO produces one PO per category, PDF downloads.
- Add a custom item under a category → it shows in the per-category total, PO row inserts with `raw_material_id: null`, appears in PO Folder.
- Delete custom item → it disappears from totals; existing annexure rows unaffected.
- Existing rows already linked to a PO remain disabled and untouched.

## Scope

All on the Requisition Planning page (`/requisitions/plan`) plus a new Vendor Item Master. No changes to calculations, numbering, approvals, PO/GRN flows or permissions beyond what is listed.

## 1. Hide RM Type, rename Status → RM Category

- Remove the **RM Type** column from the Generated Requisition table, the Raw Materials (consolidated) table and the Annexure Report tables on this page, and from the downstream views that still show it (Annexure Folder, Purchase Material, PO create from annexure, GRN list, requisition PDF).
- The underlying `raw_material_type` data stays in the database and keeps flowing into annexure/PO rows — it is only hidden from the UI.
- Rename the **Status** column header to **RM Category** on this page (Generated Requisition + Raw Materials tabs). Options stay exactly the same (Machine, 3P / Third Party, Pipe, Sheet SS, Sheet MS, Sheet GI, Structure) and the stored field (`plan_status`) is unchanged. Validation messages are reworded to say "RM Category".

## 2. Vendor Item Master (new)

New table `vendor_item_prices`:

- vendor (link to existing Vendors), material, size/model, unit, price, currency-free numeric, `is_preferred`, `is_active`, notes, timestamps.
- Read access for users who can see purchase/requisition modules; insert/update/delete restricted to admins.

New admin page **Vendor Item Master** (Admin area, next to Vendors): searchable table, add/edit/delete rows, mark a row as Preferred Vendor for that material+size.

## 3. Auto Price & Vendor on Generated Requisition

- On load, each raw-material row with an empty Price/Vendor is matched against the master on material + size (case/space-insensitive; falls back to material only when no size match).
- Selection order: **Preferred** active entry → else lowest active price → tie-break by earliest created.
- The matched price/vendor is written to that requisition row so it persists, and both cells become **editable inputs** (autosaved like the other fields). A manual edit is never overwritten by later auto-fill.
- Changing the Preferred vendor later only affects new auto-fills; existing requisitions, annexures and POs are untouched.

## 4. Item-wise annexure display

- The Annexure column on the Generated Requisition tab currently shows only a generic "Annexure Created" badge. It will show the specific annexure per row: its lot(s) + created date as a link to the Annexure Folder entry, so each item shows which annexure it went into. Rows not yet annexed keep the dash.
- Annexure data is loaded by the `annexure_id` stored on each raw-material row (today only annexures whose requisition set matches exactly are fetched, which is why some rows show no annexure).

## 5. Fix "Create Annexure for Selected Lot" error

Current behaviour: creation aborts with "Status required" when any selected row has no `plan_status`.

New behaviour:
1. Auto-resolve the missing RM Category from the row's existing `material_category` / category rules (same resolver used at requisition creation).
2. Rows still blank after that are **skipped**, and the annexure is created from the rest.
3. A warning toast lists the skipped rows (material • size • lot) so they can be fixed and re-annexed later; those rows keep their un-annexed state.
4. If every selected row is unresolved, the existing "nothing to create" message is shown instead.

## Technical notes

- Migration: `create table public.vendor_item_prices` + GRANTs (select to authenticated, all to service_role) + RLS (read for purchase/requisition/annexure viewers or admin; write admin-only) + `set_updated_at` trigger + index on lower(material).
- Auto-fill helper in `src/lib/requisition/vendorPricing.ts` (pure match + pick function, unit-testable) used by `RequisitionPlan.tsx`.
- Category auto-resolve reuses `resolveMaterialCategory` from `src/lib/requisition/materialCategory.ts` with rules from `rm_category_rules`.
- Admin page added to the Admin tabs/routes, following the existing `AdminVendors.tsx` pattern.

## Verification

- Type check + existing vitest suite.
- Open `/requisitions/plan?ids=…`: RM Type gone, header reads RM Category, Price/Vendor prefilled and editable, annexed rows show their annexure, and creating an annexure with a category-less row succeeds with a skip warning.

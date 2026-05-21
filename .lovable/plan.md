# Raw Material Master (Excel) + Requisition module

Additive extension. No changes to OA, BOQ, approval, revision, pricing, calculation, or existing UI flows. The existing `fg_raw_material_map`, `requisitions`, `requisition_items`, and `requisition_raw_materials` tables are reused. The existing Admin → Raw Material Master tab stays as a manual editor.

---

## 1. Excel format (confirmed from upload)

Two sheets, both header at row 2:

- **Sheet "Copy of FM MHE"** — cols: `Finished Good | Raw Material | Size/Model | Reqd Qty | Unit` (no Make column → Make stored as empty)
- **Sheet "Copy of FM MC"** — cols: `Finished Good | Make | Raw Material | Size/Model | Reqd Qty | Unit | Price | Sell Price | Comments` (Price/Sell/Comments ignored)

Column A holds the FG name only on the first row of each block; subsequent rows are blank and belong to the same FG until the next non-blank Column A cell. Parser groups by this rule.

Per user's matching rule: only **Make, Raw Material, Size/Model, Reqd Qty, Unit** flow into the requisition.

---

## 2. Database (one new migration)

- **Extend `fg_raw_material_map.raw_materials` jsonb schema** — each row: `{ make, material, size_model, qty_per_unit, unit }`. Fully backward compatible (existing rows missing `make`/`size_model` render as blanks; legacy `notes` ignored on read).
- **New table `rm_master_uploads`** — stores latest Excel file pointer for the sidebar module:
  - `id`, `file_path` (in `boq-documents` bucket, reuse existing), `original_filename`, `sheet_count`, `fg_count`, `row_count`, `uploaded_by`, `uploaded_at`. RLS: admin write, all-auth read. Only the latest row is shown; older rows kept but UI hides them ("no history" per answer 3 means functionally we don't surface them).
- **Extend `requisition_raw_materials`** — add nullable `make text`, `size_model text`. Backfill defaults null.

No structural change to BOQ/OA/PI/approval tables.

---

## 3. New sidebar module: Raw Material Master

Route `/raw-materials` (admin-only write, all-auth read), added to `AppSidebar` after **Requisitions** with `Boxes` icon.

Page sections:
- **Upload card**: Drag-and-drop `.xlsx`. Replace-only (overwrites mapping). Shows last upload filename + date + user.
- **Action**: "Upload & Replace Mapping" → runs new edge function `import-rm-master`.
- **Mappings table**: Searchable list of FG (model/name), # RM rows, Direct-Purchase flag, Source ("Excel" or "Manual"), Last updated. Row click opens existing editor drawer (reuses `AdminRawMaterials` editor component → extract to `src/components/admin/RawMaterialEditor.tsx`) so manual edits remain possible after import.
- Banner reminding users this is the only Excel upload surface.

The existing Admin → Raw Material Master tab stays (per answer 2) for purely manual edits; both read/write the same `fg_raw_material_map`.

---

## 4. Edge function: `import-rm-master`

- Accepts uploaded file path in `boq-documents`.
- Reads with `xlsx` (npm) on Deno. Iterates both sheets, groups rows by Column A using "first non-blank starts a new FG" rule.
- For each FG block: upsert into `fg_raw_material_map` keyed by trimmed FG name (case-insensitive). Stores Column A verbatim in `model_number` (this is the matching key per answer 1).
- Records summary in `rm_master_uploads`. Returns `{ fg_count, row_count, skipped }`.
- Admin-only (JWT role check via `has_role`).

---

## 5. Matching rule (per user's spec)

In `CreateRequisitionDialog` and `create-requisition` edge function:

1. For each BOQ FG item, look up `fg_raw_material_map` where Column A (`model_number`) matches **first**:
   - exact case-insensitive on the BOQ item's `model_number`
   - else: first FG whose Column A contains the BOQ `model_number` substring
   - else: first FG whose Column A contains the BOQ `description` (first 40 chars) substring
2. If matched: pull that FG's RM rows into `requisition_raw_materials` (qty = `qty_per_unit * boq_quantity`), source `mapped`.
3. If unmatched: insert a single placeholder row with material `"Raw Material Mapping Not Found"`, source `unmapped_placeholder`. UI shows amber warning with a "Open in Raw Material Master" deeplink. No blank/wrong RM lines generated.

Existing direct-purchase toggle still excludes FG from requisition when checked off in selection dialog.

---

## 6. Requisition module (already exists — small additions)

Already present: list page, detail page, public link, PDF, send-to-purchase. Additions:
- **Detail page RM tab**: show new `make` and `size_model` columns; highlight `unmapped_placeholder` rows in amber.
- **PDF (`src/lib/requisition/pdf.ts`)**: RM Indent table columns become **Make | Raw Material | Size/Model | Reqd Qty | Unit | Status** (drop legacy "FG sources" column).
- **List page**: already shows Requisition #, OA, BOQ, Revision, Client, Status, Created — no change. "Stale" badge already triggers on BOQ revision; Regenerate already pulls latest approved BOQ. Confirmed satisfies "always linked to latest approved BOQ".

---

## 7. File map

New:
- `supabase/migrations/<ts>_rm_master_excel.sql`
- `supabase/functions/import-rm-master/index.ts`
- `src/pages/admin/RawMaterialMaster.tsx` (new top-level page; reuses editor component)
- `src/components/rm/RmUploadCard.tsx`
- `src/components/admin/RawMaterialEditor.tsx` (extract from existing AdminRawMaterials for reuse)

Edited (additive only):
- `src/components/AppSidebar.tsx` — add "Raw Material Master" entry
- `src/App.tsx` — add `/raw-materials` route (auth-gated)
- `src/components/manufacturing/CreateRequisitionDialog.tsx` — matching now uses new rule; selection table unchanged
- `supabase/functions/create-requisition/index.ts` — same matching rule + write `make`/`size_model`
- `src/lib/requisition/pdf.ts`, `src/pages/requisitions/RequisitionDetail.tsx`, `src/pages/requisitions/PublicRequisition.tsx`, `src/lib/requisition/types.ts` — new RM columns

---

## 8. Strictly unchanged

OA editor, BOQ editor, approval/revision/pricing/calculation, `boqs`/`orders`/`proforma_invoices` schemas and RLS, sidebar visual style, design tokens, existing Admin RM tab UX.

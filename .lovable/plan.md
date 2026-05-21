## Raw Material Master + Selective Requisition

Extend the existing system with a Finish Good → Raw Material master and an item-selection step in Create Requisition. No changes to OA, BOQ, approval, revision, pricing, or existing flows.

---

### 1. Database (new migration, additive)

`fg_raw_material_map` already exists (placeholder, admin-writable, all-auth readable). Reuse as-is. Shape per row:
- `model_number` (key, unique-indexed)
- `raw_materials` jsonb: array of `{ material, qty_per_unit, unit, notes? }`
- `is_direct_purchase` boolean (NEW column) — when true, FG is bought outside; requisition skips it by default
- `notes`, `updated_by`, timestamps

New table **`requisition_raw_materials`** (per-requisition computed RM lines, snapshotted at creation):
- `requisition_id`, `requisition_item_id` (FK to `requisition_items`)
- `model_number`, `material`, `qty_per_unit`, `fg_quantity`, `required_qty`, `unit`
- `source` (`mapped` | `manual` | `unmapped_placeholder`)
- `purchase_status` (`pending` | `ordered` | `received`)
- RLS: owner-or-admin via parent requisition (same pattern as `requisition_items`).

Add column to **`requisition_items`**: `included_in_requisition boolean default true` — false means user excluded it (direct purchase / skip).

Unique index on `fg_raw_material_map.model_number` (case-insensitive).

---

### 2. Admin: Raw Material Master UI

New admin tab **Raw Material Master** under `/admin` (`src/pages/admin/AdminRawMaterials.tsx`):
- Search by model number
- Table: Model, # of RM lines, Direct Purchase flag, Updated
- Editor drawer per FG:
  - Toggle: "Direct Purchase (no requisition)"
  - Editable rows: Material, Qty per 1 unit FG, Unit, Notes
  - Add/remove rows; save → upsert into `fg_raw_material_map`
- Bulk import: CSV upload (`model_number, material, qty_per_unit, unit, is_direct_purchase, notes`) parsed client-side, upserted in a single call

No edge function needed — admin RLS already allows write.

---

### 3. Create Requisition flow (selection step)

Extend `src/components/manufacturing/CreateRequisitionDialog.tsx`:
- After opening, load all FG items from the BOQ + their map entries
- Show a table with checkboxes:
  - Columns: ✓ | Item # | Model | Description | Qty | Mapping status (Mapped / Unmapped / Direct Purchase)
  - Direct-purchase rows default **unchecked** with badge "Direct Purchase"
  - Unmapped rows checked but shown with amber warning "No RM mapping — will create placeholder lines"
  - Mapped rows default **checked**
- "Select all / none" + filter chips (Mapped / Unmapped / Direct)
- Submit → POST to `create-requisition` with `{ boq_id, selected_boq_item_ids[], notes }`

---

### 4. Edge function changes (`create-requisition`)

Currently inserts all line items. Update to:
1. Accept `selected_boq_item_ids: string[]` (required, non-empty)
2. Insert `requisition_items` only for selected items; set `included_in_requisition=true`. (Non-selected items are simply not inserted — keeps the requisition clean.)
3. For each inserted item, look up `fg_raw_material_map` by `model_number`:
   - If found and not `is_direct_purchase`: insert `requisition_raw_materials` rows = `qty_per_unit * fg_quantity`, source `mapped`
   - If `is_direct_purchase`: skip (item shouldn't have been selected; defensive guard returns 400 if it was)
   - If not found: insert one placeholder row per item, source `unmapped_placeholder`, so Purchase sees the gap
4. Return `{ requisition, raw_material_count, unmapped_count }`

---

### 5. Requisition Detail page

Extend `src/pages/requisitions/RequisitionDetail.tsx`:
- New **Raw Materials** tab (default):
  - Grouped by Material, summed across FG items (with breakdown drilldown per FG)
  - Columns: Material, Total Required Qty, Unit, # FG sources, Purchase Status
  - Per-row status toggle (`pending` → `ordered` → `received`)
  - Export buttons: **Download Requisition PDF**, **Copy Public Link**, **Send to Purchase**
- Existing FG items tab kept as-is, now showing `included_in_requisition` badge
- Banner if any items are `unmapped_placeholder` — link to admin master

---

### 6. PDF & public link

Update `src/lib/requisition/pdf.ts`:
- Add a **Raw Material Indent** section (grouped/aggregated RM table) before/after the FG section
- Footer note: "Direct-purchase FG items are excluded from this requisition."

Update `get_requisition_items_by_token` RPC (or add `get_requisition_raw_materials_by_token`) so the public `/requisition/:token` page renders the RM list against the latest approved BOQ. RM lines stay snapshotted (don't auto-recompute on every BOQ revision — that's what Regenerate is for, which already exists).

---

### 7. Strict non-changes

Untouched: OA editor, BOQ editor, approval/revision logic, pricing, calculations, `boqs`/`orders` schemas, existing RLS on those tables, sidebar styling, design tokens. All new code is additive.

---

### 8. File map

New:
- `supabase/migrations/<ts>_raw_material_master.sql` (add `is_direct_purchase`, create `requisition_raw_materials`, add `included_in_requisition`)
- `src/pages/admin/AdminRawMaterials.tsx`
- `src/components/admin/RawMaterialEditor.tsx`
- `src/components/admin/RawMaterialCsvImport.tsx`
- `src/components/requisitions/RawMaterialTable.tsx`

Edited (additive):
- `src/components/manufacturing/CreateRequisitionDialog.tsx` — selection table
- `supabase/functions/create-requisition/index.ts` — selection + RM generation
- `src/pages/requisitions/RequisitionDetail.tsx` — RM tab
- `src/pages/requisitions/PublicRequisition.tsx` — RM section
- `src/lib/requisition/pdf.ts` — RM section
- `src/lib/requisition/types.ts` — new types
- `src/components/admin/AdminTabs.tsx` — add Raw Materials tab
- `src/App.tsx` — admin route if needed

---

### 9. Open questions

1. **Qty basis** — RM `qty_per_unit` should be "per 1 unit of FG", multiplied by FG quantity at requisition time. OK? Or do you want a fixed RM qty regardless of FG count?
2. **Units conversion** — if FG unit is "Set" and RM is "kg", do you need a conversion factor, or is `qty_per_unit` already expressed as final RM unit per 1 FG (i.e. mapping owner handles conversion)?
3. **CSV import** — confirm column order: `model_number, material, qty_per_unit, unit, is_direct_purchase, notes`. Multiple rows per model = multiple RM lines.

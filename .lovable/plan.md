## Goal

Add a multi-requisition "planning" flow on top of the existing Requisitions module without touching any existing feature. Users will be able to pick 2+ requisitions on `/requisitions`, open a combined "Plan" view, consolidate identical raw materials, set Lot No. and a new 3-way Status (Machine / 3P / Steel) on each raw-material row, then click **Create Annexure** to push lot-wise totals into three reports — **Machine List**, **Steel List**, **Outside Purchase** — for Purchase to convert into POs.

All existing Requisition Detail tabs, calculations, PDFs, edit/delete/upload/history flows stay exactly as they are today.

## Scope (what changes)

1. `/requisitions` list — add checkboxes + an **Open Plan** button (enabled when 2+ selected; single select still works as today via the row's Eye icon).
2. New page **`/requisitions/plan`** (querystring `?ids=req1,req2,...`) with three tabs:
   - **Generated Requisition (consolidated)**
   - **Raw Materials (planning)** — RM rows only, no Finished Good column, **Create Annexure** button
   - **Annexure reports** — three sub-views: Machine List, Steel List, Outside Purchase (each with Lot Number header)
3. Rename the existing **Items** tab on the single-requisition Detail page to **Machine List**. Headers on Machine List / Steel List / Outside Purchase show the **Lot Number** of the planning batch.
4. Forward-to-Purchase flow remains the existing "Send to Purchase" action; the three new annexure reports become viewable inside Purchase (linked from the same plan).

No changes to BOQ, OA, PI, Manufacturing parsers, RM Master upload, admin, permissions, or any existing calculation.

## Detailed behaviour

### Requisitions list (`src/pages/requisitions/RequisitionsList.tsx`)
- Leading checkbox per row. Header has "select all on page".
- Floating action bar appears when ≥1 selected: shows count + **Open Plan ( N )** button (disabled for 1, since single-view is unchanged).
- Selection is in-memory only.

### New page `src/pages/requisitions/RequisitionPlan.tsx` (route `/requisitions/plan`)
Loads requisitions + items + raw materials for all selected IDs in parallel, plus their BOQs/orders for Make resolution (reuses existing `buildMakeResolver`).

**Tab 1 — Generated Requisition (consolidated)**
Same 10 columns as today: Finished Good | Make | Qty | Raw Material | Size | RM Qty | RM Make | UOM | Lot | Status.
- Rows from all selected requisitions are shown together, grouped by Finished Good (FG label prefixed with the source `requisition_number` so users still know origin).
- **Lot** is editable per RM row (not per FG — see schema note).
- **Status** dropdown values: `Machine`, `3P`, `Steel` (replaces Pending/Inhouse/Outside Purchase in this view only). Stored on the RM row.
- Read-only summary strip at top: total FGs, total RM rows, distinct lots.

**Tab 2 — Raw Materials (planning)**
RM rows only — no Finished Good column. Columns: Raw Material | Size | RM Make | UOM | Qty (summed) | Lot | Status | Source Reqs.
- **Consolidation rule** (client-side): rows are merged when `(material, size_model, make, unit, lot_no, status)` all match. Quantities sum; `Source Reqs` shows the contributing requisition numbers.
- Lot + Status remain editable here too; edits propagate to the underlying RM rows that compose the merged entry (split-back by source row id).
- **Create Annexure** button at top-right. On click:
  - Validates every row has a Lot and a Status; otherwise toast lists missing rows.
  - Writes an `annexure_batch` (one per click) capturing snapshot of consolidated rows grouped by Lot + Status.
  - Switches to Tab 3.

**Tab 3 — Annexure reports**
Three sub-tabs, each with a header band showing the **Lot Number(s)** included in this annexure batch and a grand total:
- **Machine List** — rows where Status = Machine
- **Steel List** — rows where Status = Steel
- **Outside Purchase** — rows where Status = 3P
Each table: Lot | Raw Material | Size | RM Make | UOM | Total Qty. Includes "Download PDF" (reuses jsPDF setup from `src/lib/requisition/pdf.ts`) and "Forward to Purchase" (sets the parent requisitions' status to `in_purchase`, same as today's single-req action).

### Single-requisition Detail page (`RequisitionDetail.tsx`)
- Rename `Items` tab label to **Machine List** (the tab `value` stays `items` to avoid breaking anything).
- The existing Steel List / Outside Purchase tabs render a small header line showing the lot numbers present in the table (read from `item.lot_no`).
- No other change — Generated, Raw Materials, calculations, PDFs, status enums, lot input on FG row, category dropdown all unchanged.

### Sidebar / routes (`src/App.tsx`, `src/components/AppSidebar.tsx`)
- Add the `/requisitions/plan` route (inside the existing `RequireModule module="requisitions"` guard). No sidebar entry needed — entered from the list page.

## Technical details

### DB migration (one migration, behind approval)
Reason: today Lot lives on `requisition_items` (per FG). The new planning view needs Lot per RM row, and a new Status vocabulary, without breaking the existing per-item Lot.

Changes on existing tables (additive only — nothing dropped or renamed):
- `requisition_raw_materials`:
  - add `lot_no text null`
  - add `plan_status text null` with check constraint in (`machine`,`3p`,`steel`) — NOT a replacement for `purchase_status`; existing `purchase_status` enum stays untouched and continues to drive existing UI.
- New table `requisition_annexures` (one row per Create Annexure click):
  - `requisition_ids uuid[]`
  - `lot_numbers text[]`
  - `created_by uuid`, `notes text null`
  - timestamps
- New table `requisition_annexure_rows`:
  - `annexure_id uuid fk`
  - `lot_no text`, `plan_status text` (machine/3p/steel)
  - `material text`, `size_model text`, `make text`, `unit text`
  - `total_qty numeric`
  - `source_rm_ids uuid[]` (for traceability back to `requisition_raw_materials`)
- Standard GRANT + RLS: authenticated users can select/insert/update/delete rows that belong to requisitions they can already see (mirroring the existing requisition policies); `service_role` full access. Add `updated_at` triggers using the existing `set_updated_at()` function.

### Files touched
- `src/pages/requisitions/RequisitionsList.tsx` — add selection + Open Plan.
- `src/pages/requisitions/RequisitionDetail.tsx` — rename Items tab label only; show Lot Number header on Steel/Machine/Outside tables.
- `src/pages/requisitions/RequisitionPlan.tsx` — new page (3 tabs, consolidation, Create Annexure, annexure tables, PDF).
- `src/App.tsx` — register `/requisitions/plan` route.
- `src/lib/requisition/types.ts` — add `lot_no`, `plan_status` to `RequisitionRawMaterialRecord`; add `AnnexureRecord` + `AnnexureRowRecord`.
- `src/lib/requisition/pdf.ts` — small helper for annexure PDFs (reuses existing setup).

### Out of scope (explicitly unchanged)
- RM Master upload page and parser (`src/pages/RawMaterialMaster.tsx`)
- `fg_raw_material_map` schema and data
- Single requisition Generated/Raw/Items behaviour, PDFs, status enums
- Manufacturing → Requisition creation edge function
- Admin pages, permissions, sidebar, login, OA/BOQ/PI

## Acceptance

- Selecting 2+ requisitions on `/requisitions` and clicking **Open Plan** opens a page with all RM rows from those requisitions in one Generated table.
- The same `(material, size, make, unit, lot, status)` combo coming from different requisitions appears as **one row with summed Qty** in the Raw Materials tab.
- Setting Lot + Status (Machine / 3P / Steel) on every row and clicking **Create Annexure** produces three lot-wise reports — Machine List, Steel List, Outside Purchase — each with the Lot Number(s) and a grand total in the header.
- Forward-to-Purchase on the plan marks all selected requisitions as `in_purchase` (existing behaviour, just applied to many).
- Opening any single requisition still shows the same tabs, columns, PDFs, and status enums as before. The only visible diff is the **Items** tab label is now **Machine List**, and Steel/Machine/Outside tables show a Lot Number header line.
- All other modules (Orders, BOQs, PI, Manufacturing, Purchase, RM Master, Admin) behave identically to today.
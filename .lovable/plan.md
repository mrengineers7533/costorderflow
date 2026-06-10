## Goal
Split the single **Steel** classification into five separate categories — **Pipe, Sheet SS, Sheet MS, Sheet GI, Structure** — across Requisition Planning, Annexure generation, Purchase Material, PO creation, and PO Folder, without disturbing existing rows already marked as `steel`.

## New status set
`machine`, `3p`, `pipe`, `sheet_ss`, `sheet_ms`, `sheet_gi`, `structure` — plus a read-only legacy value `steel` (label: "Steel (legacy)") shown only when an existing row already holds it.

## Routing rules
| plan_status | Annexure / report bucket |
|---|---|
| `machine` | Machine List |
| `3p` | Outside Purchase |
| `pipe` | Pipe annexure |
| `sheet_ss` | Sheet SS annexure |
| `sheet_ms` | Sheet MS annexure |
| `sheet_gi` | Sheet GI annexure |
| `structure` | Structure annexure |
| `steel` (legacy) | Read-only "Steel (legacy)" bucket — surfaced so old rows stay visible until a user re-classifies them. |

## Changes by file

1. **`src/lib/requisition/types.ts`** — widen the `plan_status` union to the seven new values plus `"steel"` (legacy) on both `Annexure` and the raw-material plan types.

2. **`src/pages/requisitions/RequisitionPlan.tsx`**
   - Update the `STATUS_LABEL` map and both `<Select>` dropdowns (raw-material row + consolidated bulk) to list the seven categories (no Steel option for new selections).
   - Update the per-category report renderer / titles loop so it iterates over the seven kinds and produces a section/title per kind (Machine List, Outside Purchase, Pipe, Sheet SS, Sheet MS, Sheet GI, Structure). Keep existing quantity-consolidation logic untouched.
   - When rendering existing rows whose value is `steel`, show "Steel (legacy)" as a disabled option in the Select so the value stays selectable/visible but users can switch it.

3. **`src/pages/requisitions/RequisitionDetail.tsx`**
   - Replace the single "Steel List" tab with one tab per new category (Pipe / Sheet SS / Sheet MS / Sheet GI / Structure), keeping Machine List as-is.
   - Replace the `steel` `<SelectItem>` with the five new options.
   - Add a "Steel (legacy)" tab that only appears when at least one row still has `plan_status = 'steel'`.

4. **`src/pages/requisitions/AnnexureFolder.tsx`**
   - Expand `TYPE_LABEL` and the type-filter Select to include the new five categories (Pipe / Sheet SS / Sheet MS / Sheet GI / Structure), plus a "Steel (legacy)" entry shown only when legacy annexures exist.
   - Grouping by `(lot_no, plan_status)` already handles the new values without further changes.

5. **`src/pages/purchase/PurchaseMaterial.tsx`**
   - Extend the `plan_status` union, `catLabel` map, and the category filter dropdown to the new values (+ legacy Steel shown only when present).
   - Per-category PO grouping already keys off `plan_status`, so it picks up new categories automatically.

6. **`src/pages/purchase/PoCreateFromAnnexure.tsx`**
   - Widen `Cat` and `CAT_LABEL` to include the five new categories. The existing `eq("plan_status", type)` filter then works for each one.

7. **`src/pages/purchase/PoFolder.tsx`**
   - Widen `Category`, update `catLabel`, and extend the category-filter Select with the new five options (+ legacy Steel option appearing only when historical POs with `category = 'steel'` exist).

## Backend
- No schema migration: `plan_status` and `category` are free-text. The seven new values write directly.
- No data backfill: existing rows keep `plan_status = 'steel'` and surface under the read-only "Steel (legacy)" label per your choice.

## Out of scope
- Requisition creation, PO PDF template, vendor master, ES flow — unchanged.
- Quantity consolidation logic and annexure row schema — unchanged.

## Verification
- Plan page: each of the seven categories appears in the dropdown; selecting Sheet SS for a row makes it show up under the "Sheet SS" section/report.
- Annexure Folder: filter by Pipe / Sheet SS / etc. lists the corresponding annexures; an existing steel annexure still appears under "Steel (legacy)".
- Purchase Material → PO creation: choosing a Sheet GI annexure produces a PO with category `sheet_gi`; the PO appears under the Sheet GI filter in PO Folder.
- A row still set to `steel` remains visible everywhere as "Steel (legacy)" and can be re-classified by the user.

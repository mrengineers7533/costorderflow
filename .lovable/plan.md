## Goal

Change the requisition Raw Material view to an **item-wise grouped format** matching the user's reference: one row per raw material, grouped under each Finish Good, with columns **Finished Good · Raw Material · Size / Spec · Reqd Qty · Unit**.

Apply this format consistently to:
1. `RequisitionDetail.tsx` — "Raw Materials" tab (private view)
2. `PublicRequisition.tsx` — public share page (same layout)
3. `lib/requisition/pdf.ts` — PDF "Raw Material Indent" section

No backend / data model changes. Data is already grouped by `requisition_item_id` and `model_number` in `requisition_raw_materials`.

## Target layout (matches uploaded image)

```text
| Finished Good                              | Raw Material   | Size / Spec       | Reqd Qty | Unit |
| SCREW CONVEYOR SIZE-250MM TOTAL LENGTH-9.2M| MS SHEET       | 1250X2500X3MM     |     4.70 | NOS  |
|                                            | MS SHEET       | 1250X2500X1.6MM   |     1.30 | NOS  |
|                                            | MS FLAT        | 25X3MM            |    25.76 | MTR  |
|                                            | KNOB           | 3" W/O BOLT       |     9.00 | NOS  |
| (next FG)                                  | …              | …                 |        … | …    |
```

- **Finished Good** cell: shown once per group via `rowSpan`, displaying `model_number` + short description (or `description` if model is empty). Empty for following RM rows in the same group.
- Rows ordered: by FG `item_no`, then by original RM insertion order within the group.
- Source/status badges kept compact: an "Mapping Not Found" badge on the FG cell when the group is unmapped (placeholder row). Purchase status `Select` (Pending/Ordered/Received) remains on the right in the detail view only — NOT shown in PDF or public view.
- Direct Purchase Finish Goods are excluded (they already have no RM rows).

## Files to change

### 1. `src/components/manufacturing/CreateRequisitionDialog.tsx`
No change — the wizard already shows the item-wise layout.

### 2. `src/pages/requisitions/RequisitionDetail.tsx`
- Replace the flat `<tr>` map in the "Raw Materials" tab with a grouping pass:
  - Build `groups: Array<{ item: RequisitionItemRecord; rms: RequisitionRawMaterialRecord[] }>` from `items` + `rms`, keyed by `requisition_item_id`. Items with no RMs (direct purchase) are skipped.
  - For each group render one row per RM; first row uses `rowSpan={group.rms.length}` on the Finished Good cell.
- Columns: Finished Good · Raw Material · Size / Spec · Reqd Qty · Unit · Status (status kept for purchase workflow).
- Keep the unmapped warning banner.

### 3. `src/pages/requisitions/PublicRequisition.tsx`
- Mirror the same grouped layout. Columns: Finished Good · Raw Material · Size / Spec · Reqd Qty · Unit. No status column.

### 4. `src/lib/requisition/pdf.ts`
- Replace the current flat "Raw Material Indent" autoTable with a grouped table:
  - Build the same group structure.
  - Use autoTable `body` with `rowSpan` via cell objects: `{ content: fgLabel, rowSpan: group.rms.length, styles: { valign: "middle" } }` on the first row of each group; subsequent rows omit the FG cell.
  - Columns: `["Finished Good", "Raw Material", "Size / Spec", "Reqd Qty", "Unit"]`.
- Keep the upper Finish Good items table and footer notes unchanged.

## What stays the same (untouched)

- OA, BOQ, approval, revision, pricing, calculation, workflow.
- Edge function `create-requisition`, RM Master matching, snapshots.
- Database schema, RLS, share/family tokens, regenerate-for-latest-revision.
- Items, Steel List, Outside Purchase tabs.
- Purchase status updates (still editable in the detail view).
- Wizard (Create Requisition dialog) — already item-wise.

## Notes

- "Size / Spec" maps to existing column `size_model`.
- "Reqd Qty" maps to existing `required_qty` (computed = `qty_per_unit × fg_quantity`).
- Finished Good label = `model_number` (fall back to truncated `description`) — taken from the joined `requisition_items` row so it always matches the BOQ snapshot.
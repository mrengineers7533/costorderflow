## Goal

Add **lot-wise selection** to the Raw Materials tab so annexures are created only for the chosen Lot number(s), and surface an **"Annexure Created"** status that stays in sync across **Generated Requisition**, **Raw Materials**, and **Annexure Reports**.

Additive change on top of the existing Plan page. No other module touched.

## Scope

- `src/pages/requisitions/RequisitionPlan.tsx` — UI + derivation changes.
- One small migration to add an `annexure_status` flag on `requisition_raw_materials` so the status survives reload and is visible everywhere.
- No changes to single-requisition Detail, Manufacturing, RM Master, BOQ/OA/PI, Purchase, Admin, or permissions.

## 1. Raw Materials tab — Lot selector + Create Annexure

- Add a **Lot filter / selector panel** at the top of the consolidated table:
  - Lists every distinct Lot number present in the current consolidation (derived live from Generated Requisition draft).
  - Each Lot has a checkbox. "Select all" / "Clear" shortcuts.
  - Rows with empty Lot are grouped under a disabled "(No lot — set Lot in Generated Requisition first)" entry.
- Each consolidated row also has a row-level checkbox, auto-toggled by its Lot's checkbox; the user can still uncheck individual rows inside a selected Lot.
- **Create Annexure** button:
  - Enabled only when ≥1 row is selected AND every selected row has both Lot and Status.
  - Snapshots only the selected rows into `requisition_annexures` + `requisition_annexure_rows` (existing tables).
  - After success: marks every contributing `requisition_raw_materials` row with `annexure_status = 'created'` and stores the new `annexure_id` on each row (see migration below).
  - Rows from unselected Lots are untouched.
- Rows already marked "Annexure Created" remain visible but are shown disabled with an "Annexure Created" badge and a link to the saved annexure in Tab 3. They are excluded from new annexure creation unless the user explicitly clicks "Re-include" (which clears the status for those rows — confirm dialog).

## 2. Generated Requisition tab — show status per row

- Add a read-only **Annexure** column at the end of the editable grid showing one of:
  - blank (not yet part of an annexure),
  - "Annexure Created" badge with the annexure number / created-at tooltip.
- The badge is derived from the RM row's `annexure_status` (live state, updated immediately after Create Annexure completes — no refresh).
- Editing Lot or Status on a row that is already "Annexure Created" shows a small warning ("This row is part of an existing annexure. Changes won't be reflected in the saved annexure."), but does not block the edit — existing edit behaviour is preserved.

## 3. Annexure Reports tab — reflect status

- **Live preview** mode: each row shows the same "Annexure Created" badge when its underlying RM rows are all already snapshotted; rows that are partially snapshotted show "Partially Created" with a tooltip listing remaining qty.
- **Saved annexures** mode: unchanged, plus each saved batch header lists the Lot numbers it covers (already in `requisition_annexures.lot_numbers`).
- Forward to Purchase / Download PDF behaviour unchanged.

## 4. Linking summary

```text
Generated Requisition (editable)
        │  live useMemo
        ▼
Raw Materials (consolidated)  ──▶  Lot selector ──▶ Create Annexure
        │                                              │ writes snapshot
        │                                              │ + sets annexure_status on RM rows
        ▼                                              ▼
Annexure Reports (live + saved)         requisition_annexures / _rows
```

A single source of truth (`rms` draft) drives all three tabs, and the `annexure_status` flag on each RM row is the single source for the "Annexure Created" badge everywhere.

## Technical details

### Migration

New columns on `requisition_raw_materials`:

- `annexure_status text` — null or `'created'` (check constraint).
- `annexure_id uuid references public.requisition_annexures(id) on delete set null`.
- Index on `annexure_id`.

No new tables, no policy changes (existing RLS on `requisition_raw_materials` already covers authenticated users). Grants unchanged.

### State in `RequisitionPlan.tsx`

- Extend the existing `rms` draft type with `annexure_status` and `annexure_id`.
- New local state `selectedRowIds: Set<string>` and `selectedLots: Set<string>` (Raw Materials tab only).
- New action `createAnnexureForSelection()`:
  1. Validate every selected row has Lot + Status.
  2. Insert into `requisition_annexures` with `lot_numbers = distinct selected Lots`, `requisition_ids = props.ids`.
  3. Insert one `requisition_annexure_rows` per consolidated key (existing logic, restricted to selected rows).
  4. `update` `requisition_raw_materials` for every contributing `source_rm_ids` setting `annexure_status='created'`, `annexure_id=<new id>`.
  5. Patch local `rms` state so all three tabs show the badge instantly.
- Re-include action: `update requisition_raw_materials set annexure_status=null, annexure_id=null where id in (...)` after confirm.

### UI

- Lot selector: simple `Checkbox` group + "Select all" toggle, using existing `@/components/ui/checkbox`.
- Status badge: existing `Badge` component, `variant="secondary"` for created, `variant="outline"` for partial.

## Files touched

- `src/pages/requisitions/RequisitionPlan.tsx`
- New migration: `supabase/migrations/<timestamp>_rm_annexure_status.sql`
- Types regenerate automatically post-migration; `src/lib/requisition/types.ts` gets two optional fields added to `RequisitionRawMaterialRecord` (`annexure_status`, `annexure_id`).

## Out of scope (unchanged)

- Single-requisition Detail page, Manufacturing → Requisition, RM Master, BOQ/OA/PI, Admin, permissions.
- PDF templates (annexure PDFs already render from saved snapshots; no change needed).
- ES Page flow.

## Acceptance

- Raw Materials tab shows a Lot selector; choosing Lot(s) restricts which rows feed Create Annexure.
- Create Annexure inserts only the selected rows and marks them "Annexure Created"; unselected Lots are untouched.
- "Annexure Created" badge appears immediately on the matching rows in Generated Requisition, Raw Materials, and Annexure Reports — no manual refresh, persists across reload.
- Editing Lot/Status on any row still propagates live to all three tabs; editing an already-snapshotted row shows a non-blocking warning.
- All existing flows (autosave, FG Qty rescale, live preview vs saved annexures, Forward to Purchase, PDFs, permissions) work exactly as before.

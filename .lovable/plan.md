## Goal

Extend the existing multi-requisition Plan page (`/requisitions/plan`) so that **Generated Requisition** is the live source of truth. Every cell becomes editable, and **Raw Materials** + **Annexure Reports (Machine List / Steel List / Outside Purchase)** are derived from it in real time — no manual refresh, no duplicate entry.

This is an additive change on top of the already-approved plan. No existing module (single-requisition Detail, BOQ, OA, PI, Manufacturing, Purchase, RM Master, Admin) is modified.

## Scope (what changes)

Only `src/pages/requisitions/RequisitionPlan.tsx` and its small helpers. No new tables, no schema changes beyond the previously approved `lot_no` / `plan_status` / annexure tables.

### 1. Generated Requisition tab — fully editable grid

Every cell editable inline. Columns and edit controls:

| Column          | Editor                                                |
| --------------- | ----------------------------------------------------- |
| Finished Good   | text input (per FG group header — edits all RM rows of that FG) |
| Make (FG)       | text input (per FG group header)                      |
| Qty (FG)        | number input (per FG group header) — recalculates RM Qty = qty_per_unit × FG Qty for all child RM rows that haven't been manually overridden |
| Raw Material    | text input (per RM row)                               |
| Size            | text input (per RM row)                               |
| RM Qty          | number input (per RM row; manual override flag set on edit) |
| RM Make         | text input (per RM row)                               |
| UOM             | text input (per RM row)                               |
| Lot             | text input (per RM row)                               |
| Status          | dropdown: Machine / 3P / Steel (per RM row)           |

Behaviour:
- Edits update an in-memory **draft state** keyed by RM row id (plus FG id for FG-level fields).
- Debounced autosave (~600 ms) writes back to `requisition_items` (FG fields, qty, lot) and `requisition_raw_materials` (rm fields, lot_no, plan_status). One `update` per dirty row; rows are batched per table.
- Inline "Saving…/Saved" indicator in the toolbar; failed rows are highlighted with a retry.
- FG-level Qty edit: when the user changes FG Qty, each child RM row's `required_qty` is recomputed as `qty_per_unit × new_fg_qty` unless that RM row has been manually overridden (`rm_qty_overridden` flag in local state). A small "↻" button lets the user clear the override and snap back to the computed value.
- Validation: numeric fields reject negatives; Status must be one of the three values.

### 2. Raw Materials tab — fully derived (read-only consolidation)

Rebuilt from the live Generated Requisition draft on every render via `useMemo`. No separate editing UI — edits happen in Tab 1.

Consolidation key stays `(material, size_model, make, unit, lot_no, plan_status)`. `Qty (summed)` and `Source Reqs` recompute as the user edits Tab 1.

A small banner at the top of the tab states: "Auto-derived from Generated Requisition. Edit values in the Generated Requisition tab."

The **Create Annexure** button stays here. It validates the live consolidated rows (every row needs Lot + Status), snapshots them into `requisition_annexures` + `requisition_annexure_rows`, then opens Tab 3.

### 3. Annexure Reports tab — derived from latest data

Two display modes, toggled by a segmented control in the tab header:

- **Live preview (default)** — Machine / Steel / Outside Purchase tables built straight from the current Raw Materials consolidation, filtered by `plan_status`. Always reflects the latest edits in Tab 1.
- **Saved annexures** — list of previously created annexure batches (from `requisition_annexures`) with their snapshot rows. Each saved batch shows the Lot Numbers and timestamp it was created with, so historical PDFs stay reproducible.

"Download PDF" and "Forward to Purchase" act on whichever mode is active. Live preview's PDF includes a "Generated <timestamp>" line; saved annexure PDFs use the snapshot timestamp.

### 4. Linking summary

```text
Generated Requisition (editable, persisted)
        │   (live useMemo derivation)
        ▼
Raw Materials (consolidated, read-only)
        │   (live useMemo derivation)
        ▼
Annexure Reports — Machine / Steel / Outside Purchase  (live preview)
        │   (snapshot on "Create Annexure")
        ▼
Saved annexure batches (immutable history)
```

A single in-memory store inside `RequisitionPlan.tsx` (`draftRows` + `draftItems`) feeds all three tabs, so any edit propagates instantly. Persistence is per dirty row, debounced.

## Technical details

- New local hook `useEditablePlan(requisitionIds)` inside `RequisitionPlan.tsx`:
  - Loads requisitions + items + raw materials once.
  - Holds draft state with `dirty` markers + `rm_qty_overridden` flags.
  - Exposes `update(rowId, patch)`, `updateFg(itemId, patch)`, `consolidatedRows`, `saveStatus`.
  - Debounced flush calls `supabase.from('requisition_items').update(...)` and `supabase.from('requisition_raw_materials').update(...)` per dirty id.
- Tab 1 grid uses controlled `<Input>` / `<Select>` from `src/components/ui/*` already in the project. No new dependency.
- Tab 2 becomes a pure derivation of Tab 1 draft (no local edit state).
- Tab 3 gets a `mode` segmented control (`live` | `saved`) plus the existing Create / PDF / Forward actions.
- No new tables. Existing `requisition_annexures` / `requisition_annexure_rows` continue to store immutable snapshots.

## Files touched

- `src/pages/requisitions/RequisitionPlan.tsx` — make Tab 1 editable, derive Tab 2 from draft, add live/saved toggle to Tab 3, add debounced autosave.

(No other file changes; types, routes, sidebar, single-requisition Detail page all unchanged.)

## Out of scope (explicitly unchanged)

- Single-requisition Detail page (still read-mostly with its existing Lot / category controls).
- Manufacturing → Requisition creation, RM Master upload, FG↔RM map, BOQ / OA / PI, Admin, permissions.
- DB schema beyond what the previous plan already covers.
- PDF templates beyond adding a "Generated <timestamp>" line on live-preview exports.

## Acceptance

- Every cell in the Generated Requisition tab can be edited in place; edits persist automatically (visible "Saved" indicator) and survive a page reload.
- Editing FG Qty rescales all non-overridden child RM Qty values immediately; an overridden RM Qty stays put until the user clears the override.
- Editing Lot or Status on any RM row instantly updates the Raw Materials consolidation and the Machine / Steel / Outside Purchase live preview without a refresh.
- "Create Annexure" still snapshots the current consolidated rows into `requisition_annexures`; saved batches remain viewable in Tab 3's "Saved annexures" mode.
- All existing modules, calculations, status enums, PDFs, upload history, permissions, and the single-requisition view continue to behave exactly as today.

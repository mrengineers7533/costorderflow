## Goal

In the Create Requisition → Review & Edit step, add a per-Finish-Good **RM Master search/select** control next to the existing "Load from RM Master" button, so the user can search any FG entry in the Raw Material Master and load its rows into the current FG — useful when auto-match missed or when manually building a requisition.

## Where it goes

File: `src/components/manufacturing/CreateRequisitionDialog.tsx`

Header strip of each FG card in the review step (around line 369–377):

```text
[2. Aspiration Cyclone · MRAC-13 · Qty 1]   [Search RM Master ▾]  [⏻ Direct Purchase]  [Load from RM Master]
```

The "Load from RM Master" button (auto-match by model/description) stays untouched. The new control is an additional, explicit picker.

## Behavior

1. **Search input + dropdown** (popover-style combobox) populated from `fullMaps` (already loaded in `useEffect`, so no extra query).
2. Filter list by case-insensitive substring against `model_number` as the user types.
3. Show up to ~30 matches; each row displays the FG name and a small badge `N RM` or `Direct Purchase`.
4. On select:
   - Replace that FG's `edited[fgId].raw_materials` with the chosen mapping's rows (same shape mapping used by `loadFromMaster`).
   - Set `edited[fgId].is_direct_purchase` from the selected mapping.
   - Toast: `Loaded {N} raw material rows from "{model}"`.
5. If `fullMaps` is empty → input is disabled with placeholder "RM Master is empty".
6. If no matches → show "No FG found in RM Master" inside dropdown; user can keep manual rows or add new ones via existing `Add RM row`.
7. **Direct Purchase** toggle behavior is unchanged: when ON, requisition skips that FG (existing logic in `toggleDirect` + edge function already handles this).

## Implementation notes

- Reuse existing shadcn `Popover` + `Command` (already in `src/components/ui/`) for the searchable combobox. No new dependencies.
- Extract a small inline component `RmMasterPicker({ maps, onPick })` inside the same file to keep diff small.
- `onPick(map)` calls a new helper `applyMappingTo(fgId, map)` that mirrors the body of `loadFromMaster` but takes an explicit `FullMap` instead of running `findMappingFor`.
- Refactor `loadFromMaster` to call `applyMappingTo` to avoid duplication.
- Keep all types, edge function payload, and save flow unchanged — the picker only mutates the in-memory `edited` state before the user clicks Create.

## Out of scope (unchanged)

- OA, BOQ, approval, revision, pricing, calculation, workflow
- Edge function `create-requisition` (already accepts manual `edited_items`)
- RequisitionsList, RequisitionDetail, PDF, share link, Send to Purchase
- Raw Material Master page
- DB schema / migrations
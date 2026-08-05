# Annexure creation: require Lot + RM Category

Scope: Requisition Planning page → Raw Materials (consolidated) tab only. No changes to Annexure Folder, PO, or requisition data flows.

## Rules to apply

1. **Eligibility** — a consolidated raw-material row can be selected/annexed only when it has BOTH a Lot Number and an RM Category explicitly filled. Rows missing either stay pending: checkbox disabled, shown as "Pending — Lot / RM Category required" in the Annexure column.
2. **No silent auto-fill** — the current behaviour that guesses a missing RM Category from keywords/rules during annexure creation is removed for eligibility purposes, so a blank category no longer slips into an annexure.
3. **Bulk action stays** — "Select all", lot-wise selection, and individual row selection continue to work, but only eligible rows are included; one click creates a single annexure covering all selected eligible rows.
4. **Status text after creation** — replace the current badge + "Re-include" link with plain, non-clickable text "Annexure Created". No link, no navigation, no re-include action from this cell.
5. **Counters/messages** — the eligibility counter reads "N of M row(s) eligible"; if nothing eligible is selected, the toast explains that Lot Number and RM Category must be filled first.

## Technical notes

File: `src/pages/requisitions/RequisitionPlan.tsx`

- `isRowSelected` gains a `plan_status` requirement (in addition to the existing lot + not-already-created checks).
- In `createAnnexure`, drop the `planStatusFromCategory` / `resolveMaterialCategory` / `inferPlanStatus` fallback chain and the `bulkPatch` write-back of guessed categories; build rows straight from `lot_no` + `plan_status`. Show a validation toast when the selection has no eligible rows.
- Row checkbox `disabled` becomes `created || !c.lot_no || !c.plan_status`; "Select all" and lot toggles keep working since selection is filtered through `isRowSelected`.
- Annexure cell: `created` renders a plain `<span>Annexure Created</span>`; remove the `reincludeRow` button from this cell (function itself left unused/removed).
- Unchanged: consolidation logic, lot-per-finished-good entry, Forward to Purchase, annexure reports, PO flow.

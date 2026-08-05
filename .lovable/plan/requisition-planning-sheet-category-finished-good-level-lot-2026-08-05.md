# Requisition Planning — Sheet category + Finished Good level Lot number

Display and entry changes only on the Requisition Planning page (`/requisitions/plan`). No changes to requisition generation, mapping, quantities, consolidation, annexure creation, purchase forwarding, or any stored material data.

## 1. RM Category shows a single "Sheet"

- The RM Category dropdown lists **Sheet** in place of the two separate options **Sheet MS** and **Sheet SS**. Sheet GI, Pipe, Structure, 3P, Machine stay exactly as today.
- Rows already stored as Sheet MS or Sheet SS display as **Sheet**.
- Stored values are untouched: a Sheet MS row stays Sheet MS in the database, keeps its grade, spec, thickness, size, weight, rate, item code, stock and history, and continues to flow to its existing annexure bucket.
- When a user picks **Sheet** on a row that already has MS or SS, the stored value is kept as-is. On a row with no category yet, the material name decides it (name containing "SS" stores Sheet SS, otherwise Sheet MS), so downstream annexure splitting keeps working.
- Annexure Reports tabs, PDFs and downstream pages are unchanged.

## 2. Finished Good group header with one Lot input

Each Finished Good group in the Generated Requisition table gets a header block showing:

```text
Airlock 250
Code: 842839
Requisition: REQ/26-27/0001-R0/002
Qty: 1.00
Lot: [ input ]
```

- Finished Good **name** is shown alongside the existing code — the code is not removed, and the existing editable name/qty/make cells stay.
- Typing a Lot number in the group input writes that value to every raw-material row of that group in one save.
- The per-row Lot cells remain visible but become read-only, showing the inherited value.

## 3. Grouping key

Groups are already keyed by requisition id + requisition item id (the Finished Good line), so a Lot entered for one Finished Good in one requisition never touches the same Finished Good in another requisition or another line.

## 4. Persistence and downstream

The Lot number continues to be stored on each `requisition_raw_materials` row exactly as today — only the way it is entered changes. So it survives refresh, re-login and reopening, and flows unchanged into Annexure Folder, Annexure Reports, Purchase forwarding, Purchase Requisition, Purchase and GRN.

## 5. Validation on Forward to Purchase

Before forwarding, check every Finished Good group has a Lot number. If any is missing, block the action and show:

"Please enter the Lot Number for Finished Good 'Airlock 250' before forwarding."

No Lot number is ever auto-copied from another group.

## Technical notes

- File: `src/pages/requisitions/RequisitionPlan.tsx` only.
- Add a display-level category mapping (`sheet_ms`/`sheet_ss` -> label "Sheet") next to the existing `STATUS_LABEL`; keep `PlanStatus`, `ACTIVE_STATUSES` semantics for reports intact by rendering a merged option list in the Select while resolving the stored value on change.
- Group-level Lot uses the existing `bulkPatch(sourceRmIds, { lot_no })` style batch update against `g.rms.map(r => r.id)`; row-level Lot inputs switch to read-only display.
- `forwardToPurchase()` gains a pre-flight check over `groups` for a missing `lot_no`.

## Problem

In Manufacturing and Purchase folders, `26-27/GMSBOQ/0003/R0` shows a green **Approved** badge even though Design has not approved the BOQ and the linked OA is not approved. The working reference `26-27/GMSBOQ/0002/R9` is correctly approved (Design has approved all items).

### Root cause

All three list pages (`BoqFolder`, Purchase `ApprovedBoqListPage`, Manufacturing `ApprovedBoqListPage`) and the detail page (`ApprovedBoqDetailPage`) decide the badge purely from `boqs.verification_status === 'approved'`. For BOQ `0003/R0` that flag is `'approved'`, but:

- It has **zero** rows in `boq_item_design_status` (no Design approval applied).
- Its line items have no `approval_status='approved'` (linked OA has not received Design approval mirror).

So `verification_status` alone is not a reliable signal of "Design + OA approved".

## Fix (display-only)

Introduce a single shared helper and use it everywhere the green "Approved" pill is rendered. No changes to data writes, revision logic, calculations, workflows, list inclusion, navigation, or any other UI.

### New helper

`src/lib/boq/designApprovalStatus.ts`

```ts
export type DesignApprovalState = "approved" | "not_approved";

export async function fetchDesignApprovalStates(
  boqs: Pick<BoqRecord, "id" | "revision" | "line_items">[]
): Promise<Map<string, DesignApprovalState>>
```

Logic per BOQ — returns `"approved"` only when **both** are true:

1. **Design BOQ approved:** `boq_item_design_status` has at least one row with `status='approved'` for this `boq_id` at the current revision, AND no row exists with `status='rejected'` or `status='pending'` for items in the current snapshot.
2. **Linked OA approved:** every item in `line_items` has `approval_status === 'approved'` (this is the mirror that OrderEditor already uses to render "Approved by Design" on the OA — same source of truth, so the two views can never disagree).

Otherwise returns `"not_approved"`.

### Call sites to update (badge text only)

- `src/pages/purchase/BoqFolder.tsx` — list badge (currently always `tab` label colored green): show `Approved` / `Not Approved by Design` based on helper.
- `src/pages/modules/ApprovedBoqModule.tsx`:
  - `ApprovedBoqListPage` card badge.
  - `ApprovedBoqDetailPage` header badge (`approved && <Badge…>Approved</Badge>`).
- These two pages drive both `/purchase` and `/manufacturing` via `PURCHASE_CONFIG` / `MANUFACTURING_CONFIG`, so one change covers both modules.

Badge variants:
- `approved` → existing green `Badge className="bg-emerald-600 hover:bg-emerald-600"`Approved.
- `not_approved` → `Badge variant="secondary"` with text **Not Approved by Design** (amber/neutral; no green).

### Behavior on the affected records

- `26-27/GMSBOQ/0003/R0` → no `boq_item_design_status` rows → badge becomes **Not Approved by Design**.
- `26-27/GMSBOQ/0002/R9` → 4 approved Design rows for 4 items, all line items mirror `approved` → badge stays **Approved** (matches today).

### Explicitly NOT changing

- List inclusion rule (`pickLatestApprovedPerFamily`) — same records continue to appear.
- `verification_status`, revision/carry-forward logic, BOQ/OA numbering, totals, PDFs, routing, edit permissions.
- OrderEditor, BoqEditor, DesignBoqView, requisition/PO flows — untouched.

## Verification

1. Open `/purchase/approved` and `/manufacturing` GMS tab: `0003` shows **Not Approved by Design**, `0002/R9` shows **Approved**.
2. Open detail page for `0003`: header badge shows **Not Approved by Design**; "Create Requisition" button remains as-is (separate `verification_status` gate, unchanged).
3. DB sanity: `select boq_id, count(*) from boq_item_design_status where boq_id in (...) group by 1;` matches expectation.

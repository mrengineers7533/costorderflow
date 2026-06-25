# Manufacturing: OA-derived approval + Approved/General folders

## Problem
Manufacturing currently shows "Approved" based on the BOQ's own `verification_status`. It must instead be derived from the **latest linked OA revision's** status (OA "approved" = `orders.status = 'finalized'`). Also, Manufacturing needs two folders: **Approved BOQ** and **General BOQ (Not Approved)**.

## Scope
Frontend-only change. No DB schema, no workflow, no numbering, no other modules touched. Purchase module behavior unchanged.

## Changes

### 1. `src/pages/modules/ApprovedBoqModule.tsx` (Manufacturing only)
- Add a helper that, given a BOQ, finds its OA family (`parent_order_id || order_id`), picks the **latest revision OA** in that family, and returns whether its `status === 'finalized'`.
- In `ApprovedBoqListPage`:
  - Keep `pickLatestApprovedPerFamily` (BOQ-side latest+approved) as the candidate pool — unchanged for Purchase.
  - For `config.kind === "manufacturing"`, split rows into:
    - **Approved**: BOQ is approved AND latest OA revision in family is `finalized`.
    - **General (Not Approved)**: everything else from the latest-per-family pool (BOQ approved but latest OA not finalized, or BOQ not approved). Pull from the full BOQ set (not just approved) so unapproved BOQs also appear here. Still one row per OA family (latest BOQ).
  - Add a folder tab switch above the MR/GMS tabs (Manufacturing only): `Approved BOQ` | `General BOQ (Not Approved)`. Counts shown.
  - The "Approved" badge in each card is rendered only when latest OA is finalized; otherwise show a neutral badge (e.g. `OA Pending` / `OA Draft`) so users see why it's in the General folder.
- In `ApprovedBoqDetailPage` (Manufacturing only):
  - Compute `oaApproved = latestOrderInFamily.status === 'finalized'`.
  - Only show the Approved badge and the **Create Requisition** button when `oaApproved && boq.verification_status === 'approved'`. (Purchase detail path unchanged.)

### 2. `src/pages/manufacturing/ManufacturingList.tsx`
- No structural change beyond the existing "Open BOQ Folder" link — the new folder toggle lives inside `ApprovedBoqListPage`.

### Untouched
- Purchase module (`PURCHASE_CONFIG` flow) — keeps current behavior.
- DB schema, RLS, BOQ approval logic, revisions, requisition pipeline.
- All other filters, numbering, UI layout, validations.

## Technical notes
- "Latest OA in family" = order with the highest `revision` among rows where `id = root` OR `parent_order_id = root`. Already fetched via `orders` query in the list page; just index by family.
- OA-approved signal = `orders.status === 'finalized'` (project convention; only `draft` and `finalized` exist).
- Detail page already loads the linked order; extend it to also fetch siblings of the same family to find the latest revision before deciding `oaApproved`.

## Verification
- Manufacturing list with the sample data: `MRBOQ/26-27/0007/R1` linked to `MROA/2026-27/0007/R1` (status `draft`) → must appear under **General BOQ (Not Approved)** without the green Approved badge.
- A BOQ whose latest OA revision is `finalized` → appears in **Approved BOQ** with the badge.
- Purchase module list/detail unchanged.

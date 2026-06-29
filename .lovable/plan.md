## Goal
Make the existing "Seen" action visible on every module page that owns a notification's target record, without changing any notification rule, approval flow, or other behavior.

## Root cause
`ModuleNotifications` already renders a "Seen" button under the strict rule (`canAckClient`: user's department matches `target_departments` and user is not the actor). That banner is currently mounted only on:

- `src/pages/design/DesignBoqView.tsx`
- `src/pages/boqs/BoqEditor.tsx`
- `src/pages/orders/OrderEditor.tsx`
- `src/pages/pi/PiEditor.tsx`
- `src/pages/modules/ApprovedBoqModule.tsx`
- `src/pages/requisitions/RequisitionDetail.tsx`

So users in Purchase, Manufacturing, BOQ Folder, PO Folder, Annexure Folder, Planning/Tracking/Dispatch views never see the Seen button — because the banner itself isn't on those pages.

## Scope (display-only)
Mount the existing `ModuleNotifications` banner near the top of each missing module page, passing the correct `links` (orderRootId / boqId / piId / poId / requisitionId / annexureId) so the RPC returns only that record's notifications. Keep the strict `canAckClient` rule unchanged.

Pages to add the banner to:

1. `src/pages/purchase/BoqFolder.tsx` — links: `{ boqId, orderRootId }`
2. `src/pages/purchase/PoFolder.tsx` — links: `{ poId, orderRootId }`
3. `src/pages/purchase/PurchaseDetail.tsx` — links: `{ orderRootId, boqId }`
4. `src/pages/manufacturing/ManufacturingDetail.tsx` — links: `{ orderRootId, boqId }`
5. `src/pages/manufacturing/ManufacturingBoqFolder.tsx` — links: `{ boqId, orderRootId }`
6. `src/pages/requisitions/AnnexureFolder.tsx` — links: `{ annexureId, requisitionId }`
7. `src/pages/purchase/PoCreateFromAnnexure.tsx` — links: `{ annexureId }`
8. `src/pages/grn/GrnList.tsx` (Dispatch/GRN per-row context if a single record is open; otherwise skip)
9. `src/pages/boqs/FamilyBoq.tsx` and `src/pages/boqs/FinalBoq.tsx` — links: `{ boqId, orderRootId }`

For each page I'll:
- Import `ModuleNotifications`.
- Read the already-loaded record ids in that page (no new fetches; reuse existing state).
- Render `<ModuleNotifications links={...} />` directly under the page header.

No changes to:
- `canAckClient`, `mark_notification_seen` RPC, or any other notification logic
- Approval/sync logic, OA/BOQ revision flow, numbering, access checks
- The banner component itself
- Notification dashboard or header bell

## Verification
- Build passes.
- On each updated page, the amber Notifications banner appears when a notification exists for that record; users in a matching target department see the "Seen" button; actors and non-target users do not (existing rule preserved).
- Run `bunx vitest run` to confirm no regressions in the existing notification/approval tests.

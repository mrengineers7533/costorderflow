## Goal
Surface the same `NotSeenNotifBadge` already used on OA / BOQ / PI lists/details on every Manufacturing and Purchase screen that lists or opens an OA/BOQ record. No notification-logic changes — pure presentation, reusing the existing `useUnseenNotifCount` hook + `get_related_notifications` RPC, so counts stay in lock-step with the bell, banner and dashboard.

## Screens touched
1. **Manufacturing list** (`ManufacturingList` → `ApprovedBoqListPage` with `kind="manufacturing"`)
2. **Manufacturing detail** (`ManufacturingDetail` → `ApprovedBoqDetailPage`)
3. **Purchase list** (`PurchaseList` → `ApprovedBoqListPage` with `kind="purchase"`)
4. **Purchase detail / "Purchase Factory"** (`PurchaseDetail` → `ApprovedBoqDetailPage`)
5. **Purchase → BOQ Folder** (`src/pages/purchase/BoqFolder.tsx`) — MR/GMS approved-BOQ cards
6. **Purchase landing** (`PurchaseLanding.tsx`) — no record rows, no badge needed (skip)
7. **PO Folder / PurchaseMaterial / PoCreateFromAnnexure** — these are PO/material screens, not OA/BOQ row lists, so out of scope unless the user later wants per-PO badges (would require a new `poId` path in the hook).

## Changes

### `src/pages/modules/ApprovedBoqModule.tsx`
- Import `NotSeenNotifBadge`.
- **List card** (`ApprovedBoqListPage`): inside each `<Card>` row, render `<NotSeenNotifBadge variant="cell" boqId={b.id} orderRootId={familyOf.get(b.order_id) ?? b.order_id} />` next to the Approved/R badges. Compute `familyOf` (already computed inside `pickLatestApprovedPerFamily`) and expose it so the card can pass `orderRootId`.
- **Detail header** (`ApprovedBoqDetailPage`): next to the existing "Approved" / "R{rev}" badges, render `<NotSeenNotifBadge boqId={boqId} orderRootId={orderRootId ?? undefined} />` (inline variant) so the count is visible above the existing `ModuleNotifications` banner.

### `src/pages/purchase/BoqFolder.tsx`
- Import `NotSeenNotifBadge`.
- In each MR/GMS card row add `<NotSeenNotifBadge variant="cell" boqId={b.id} orderRootId={familyOf.get(b.order_id) ?? b.order_id} />` next to the approved badge. Same `familyOf` precompute as above.

## Out of scope
- No DB / RPC / hook changes.
- No edits to `NotSeenNotifBadge`, `useUnseenNotifCount`, `ModuleNotifications`, `count_unread_notifications`, dashboard, or any notification creation logic.
- Manufacturing detail's "Create Requisition" button and Purchase workflow cards stay untouched.
- PO/Material/Annexure screens (no per-PO badge plumbing exists yet) — can be added later if requested.

## Acceptance
- Manufacturing list, Purchase list, and BOQ Folder each show a clickable unseen-count pill on every approved-BOQ row.
- Manufacturing detail and Purchase detail show an inline "Not Seen Notifications: N" pill in the header.
- Clicking any pill navigates to `/notifications?unseen=1&boq=<id>` (existing behavior).
- Counts match the bell / banner / dashboard exactly (same RPC).
- Existing notification features, counts, dashboard, folder counts, detail counts unchanged.

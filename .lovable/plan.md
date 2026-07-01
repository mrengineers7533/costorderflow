## Goal
Make the **Seen** and **Acknowledge** buttons visible on every notification row on every page that has notifications, and guarantee no build errors from missing props.

The button code already exists and is production-tested in three surfaces:
- `ModuleNotifications` — per-row **Mark as Seen** + **Acknowledge** buttons (gated by `canAckClient`, i.e. target-dept user, never the actor).
- `DeptNotificationsDialog` — per-row **Seen** button (opened from the global header bell).
- `NotificationDetailDialog` — explicit **Seen** + **Acknowledge** in the footer.

The gap is only that `ModuleNotifications` is currently mounted on 7 pages, so on the remaining detail/folder pages users have to open the header bell to reach the buttons. This plan mounts the same banner on the missing pages, with the correct related-record props, so the buttons render inline. No component, RPC, DB, or workflow code is changed.

## Scope (UI-only mounts)

Read each page, find the id it already loads, add one `<ModuleNotifications links={{ … }} />` near the top of the main content, and import the component. Nothing else on the page changes.

1. `src/pages/purchase/BoqFolder.tsx` — `links={{ boqId: selectedRowBoqId }}` on the detail view; on the list view render one banner per open card is unnecessary — the badge already links out. Mount only when a single BOQ context exists on the page.
2. `src/pages/purchase/PoFolder.tsx` — `links={{ poId: selectedPoId }}`.
3. `src/pages/manufacturing/ManufacturingBoqFolder.tsx` — inherits `BoqFolder`; no separate change.
4. `src/pages/requisitions/AnnexureFolder.tsx` — `links={{ annexureId }}`.
5. `src/pages/boqs/DesignReview.tsx` — `links={{ boqId: id }}`.
6. `src/pages/boqs/BoqVerify.tsx` — `links={{ boqId: id }}`.
7. `src/pages/boqs/FamilyBoq.tsx` and `FinalBoq.tsx` — mount only if the page is loaded by an authenticated user with a single `boqId` in scope; otherwise skip (public token links have no session).

Pages already mounting the banner remain untouched: `OrderEditor`, `BoqEditor`, `DesignBoqView`, `ApprovedBoqModule` (which powers `PurchaseDetail` and `ManufacturingDetail`), `PiEditor`, `RequisitionDetail`, `PoCreateFromAnnexure`.

The global header bell (`GlobalNotificationsBell` → `DeptNotificationsDialog`) is already in `AppLayout` and already renders a per-row **Seen** button; it stays as the fallback surface on pages that have no single-record context.

## Guardrails
- `ModuleNotifications` props are all optional and it early-returns when there are no matching rows — mounting it can never regress a page.
- Every new mount passes only ids already loaded on that page; no new fetches, no prop-shape changes.
- No change to `ModuleNotifications`, `NotificationDetailDialog`, `DeptNotificationsDialog`, `canAckClient`, `markNotificationSeen`, RPCs, or `app_notification_reads`.
- No change to OA / BOQ / PI / Design / Manufacturing / Purchase / Requisition / Annexure / Planning / Tracking / Dispatch / costing / numbering / approval / Save Draft / Finalize / Convert to PI logic.
- No new "Mark all seen" bulk action.

## Verification
- Build passes (auto).
- On each newly-mounted page, as a target-dept (non-actor) user with a related notification: banner renders → per-row **Mark as Seen** and **Acknowledge** buttons visible → clicking flips the badge to Seen / Acknowledged and updates the header-bell count via realtime.
- As the actor of a notification: no Seen / Acknowledge button on any page (existing rule preserved).
- Pages with no related notifications: banner stays hidden (existing early-return).
- Header bell continues to work on every route as the universal fallback surface.

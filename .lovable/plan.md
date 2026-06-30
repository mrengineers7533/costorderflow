## Goal
Make the explicit **Seen** and **Acknowledge** buttons reachable from every page/module that has notifications — without touching any OA / BOQ / PI / Manufacturing / Design / Purchase / Requisition workflow logic.

The button code already exists inside `ModuleNotifications` (solid blue, pulsing, gated by `canAckClient` → target-dept user, never the actor). The reason the user sees it "missing" on most pages is simply that the `ModuleNotifications` banner is only mounted on 7 pages today:

```
src/pages/orders/OrderEditor.tsx
src/pages/boqs/BoqEditor.tsx
src/pages/design/DesignBoqView.tsx
src/pages/modules/ApprovedBoqModule.tsx
src/pages/pi/PiEditor.tsx
src/pages/requisitions/RequisitionDetail.tsx
src/pages/purchase/PoCreateFromAnnexure.tsx
```

So on Purchase folder, BOQ folder, Manufacturing folder/detail, Annexure folder, PO folder, etc. — there is no banner → no per-row Seen / Acknowledge button. This plan only **mounts the existing banner** on those remaining detail/folder pages and (optionally) surfaces the same buttons in the global Activity bell. No banner, no button, no notification logic, no RPC, no DB change is modified.

## Scope (UI-only mounts)

Add a top-of-page `ModuleNotifications` banner — using the same component, props, and gating already in production — to these pages, each with the correct `links` for its record context. Nothing else on these pages changes.

1. `src/pages/purchase/BoqFolder.tsx` — `links={{ boqId }}`
2. `src/pages/purchase/PoFolder.tsx` — `links={{ poId }}` (use the page's PO id)
3. `src/pages/purchase/PurchaseDetail.tsx` — `links={{ requisitionId, annexureId, orderRootId }}` (whichever the page already loads)
4. `src/pages/manufacturing/ManufacturingDetail.tsx` — `links={{ requisitionId, orderRootId, boqId }}`
5. `src/pages/manufacturing/ManufacturingBoqFolder.tsx` — `links={{ boqId }}`
6. `src/pages/requisitions/AnnexureFolder.tsx` — `links={{ annexureId }}`
7. `src/pages/boqs/FamilyBoq.tsx` and `src/pages/boqs/FinalBoq.tsx` — `links={{ boqId }}` (only if a single boq context exists on the page)
8. `src/pages/boqs/DesignReview.tsx` — `links={{ boqId }}`
9. `src/pages/boqs/BoqVerify.tsx` — `links={{ boqId }}`
10. `src/pages/design/DesignBoqList.tsx` — skipped (list page; no single record context). List pages stay as-is — users open the row to get the banner.

For each page: read the file first, find the existing primary record id it already loads (no new fetches), import `ModuleNotifications`, and render it once near the top of the main content. No styling overrides beyond what the component already does.

## Optional surface (only if you also want it inside the bell)
- `src/components/activity/ActivityBell.tsx` — additionally render a `<DeptNotificationsDialog>` trigger inside the sheet so the per-row Seen button (already added to that dialog) is reachable from anywhere via the header bell. No change to `ActivityPanel` filtering or `useActivityFeed` logic.

Mark this section "optional" — implement only if confirmed; otherwise skip.

## Explicit non-goals (guard)
- No change to `ModuleNotifications`, `NotificationDetailDialog`, `DeptNotificationsDialog`, `canAckClient`, `markNotificationSeen`, `mark_notification_seen` RPC, `app_notification_reads`, or any notification creation code.
- No change to OA, BOQ, PI, Design, Manufacturing, Purchase, Requisition, Annexure, Planning, Tracking, Dispatch, costing, numbering, approval, Save Draft, Finalize, or Convert to PI logic.
- No new "Mark all seen" bulk action.
- No list-page banners (would need a synthetic context and risks duplicate-notification noise).

## Verification
- Build via existing pipeline.
- Manual: open each newly-mounted page as a target-dept (non-actor) user → banner appears (if relevant notifications exist) → **Mark as Seen** + **Acknowledge** buttons render per row → clicking flips the badge to **Seen** / **Acknowledged**.
- As the actor of a notification → no Seen / Acknowledge button on any page (existing rule preserved).
- Pages with no related notifications → banner stays hidden (existing behavior — `rows.length === 0` early-return).

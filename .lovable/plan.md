## Add "Pending Notifications" column to Design BOQ list

Add a new column between "Approval" and "Last Updated" in `src/pages/design/DesignBoqList.tsx` that shows a per-family pending-notification count for the logged-in Design user.

### Behavior
- Reuse the existing `NotSeenNotifBadge` (variant `cell`) and `useUnseenNotifCountsMap` hook — no changes to notification creation, Seen/Ack rules, or backend logic.
- Since the list already collapses to one row per BOQ family (latest revision), collect every BOQ id belonging to each visible family and sum their unseen counts so the badge covers the entire revision chain.
- Clicking the badge navigates to `/notifications?unseen=1&boq=<latestBoqId>` (existing `NotSeenNotifBadge` behavior), opening the current Notification Dashboard filtered to that BOQ.
- Realtime + personal-seen listeners already inside `useUnseenNotifCountsMap` make the count drop immediately when a notification is marked Seen.
- Show `0` when nothing pending (matches badge default).

### Implementation details
1. In the initial `boqs` fetch, keep the raw `all` array; build `familyToBoqIds: Map<familyKey, string[]>` alongside the existing `byFamily` map (same family-key logic: orders parent → boq_number → order_id → id).
2. Store `familyToBoqIds` in state so the render pass can look up sibling BOQ ids for each visible row.
3. Compute `allBoqIds` = union of every id from visible families, pass to `useUnseenNotifCountsMap("boq", allBoqIds)`.
4. New `<TableHead>Pending Notifications</TableHead>` + `<TableCell>` rendering a single `NotSeenNotifBadge` with:
   - `boqId={r.id}` (so click deep-links to the latest revision as required),
   - a numeric override showing the summed count for the whole family.
5. Because `NotSeenNotifBadge` computes its own count internally, add a lightweight sibling: render a small button mirroring its `cell` style but using the pre-summed family count. Keep it visually identical to existing badges elsewhere so UI layout is unchanged.

### Files touched
- `src/pages/design/DesignBoqList.tsx` — add column, family-id map, hook call, badge cell.

No other files, RLS, or backend logic change.

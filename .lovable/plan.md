## Goal

Stop the acting module from ever receiving its own notification. Fix it at the recipient / query layer so every surface (top bell, Not‑Seen badge, banner, folder columns, detail panel, advanced dashboard's per‑user counts) sees the same numbers. No UI redesign, no change to existing acknowledge / old‑value / new‑value / line‑item / real‑time logic.

## Model change

`notification_recipients` is currently department‑only. We add a module dimension so OA, BOQ and PI can be addressed independently even though they share the "Costing" group.

New enum `notif_module` with values:
`oa, boq, pi, design, purchase, manufacturing, requisition, project`

`notification_recipients` gets a nullable `module notif_module` column.
- One user may have multiple rows (one per module they own).
- Legacy rows where `module IS NULL` keep behaving like today (department‑level match).
- Project rows can be added now; no triggers will fire until the Project module ships.

`app_notifications` already stores `module` (the source module: `order`, `boq`, `pi`, `purchase`, `requisition`, `design_comment`, `grn`, `annexure`, …). We map those raw modules to the recipient enum via a small SQL helper `notif_source_module(module text, event_type text) → notif_module` (e.g. `order → oa`, `boq → boq`, `pi → pi`, `purchase|grn → purchase`, `requisition|annexure → requisition`, `design_comment → design`, `boq + design_item_status_changed → design`).

## Where exclusion happens

`emit_notification` (DB function) is updated so `target_departments` is built by:
1. Pulling all active `notification_recipients`.
2. Excluding any recipient whose `module` equals `notif_source_module(_module, _event)` **OR** (when `module IS NULL`) whose `department` equals the actor's department — back‑compat for un‑migrated rows.
3. If the resulting target list is empty, skip the insert entirely (no orphaned self‑only rows).

So a Costing user editing an OA produces a notification with OA‑module recipients removed but BOQ‑module and PI‑module Costing users still included.

## Per‑viewer query filter (shared by every count surface)

New `current_user_modules()` SQL function returns the set of `notif_module` values configured for `auth.uid()` in `notification_recipients` (active rows only). Falls back to the user's department mapping if no module rows exist.

`get_related_notifications` RPC is updated to additionally require:
`notif_source_module(n.module, n.event_type) <> ALL(current_user_modules())`
i.e. never return a notification whose source module is one the viewer owns. This is the single chokepoint — every UI consumer that uses this RPC gets correct filtering automatically.

The sidebar bell (`useUnreadNotifications`) currently queries `app_notifications` directly. We replace that query with a new `count_unread_notifications()` RPC that applies the same source‑module filter and joins `app_notification_reads`, returning one integer. Same chokepoint, no client‑side filtering logic to drift.

The Advanced Notification Dashboard already shows the full system‑wide stream by design — it stays unfiltered (admin / audit view). Its counts remain accurate because we don't create empty/self‑only rows.

## Admin UI

`notification_recipients` admin screen gets a "Module" dropdown next to Department. A single user can be added multiple times, one row per module they own. Existing rows show "All (department‑level)" until edited. No other admin changes.

## Files touched

- New migration: enum `notif_module`, add `module` column to `notification_recipients`, helper `notif_source_module`, `current_user_modules`, updated `emit_notification`, updated `get_related_notifications`, new `count_unread_notifications`.
- `src/hooks/useUnreadNotifications.ts` — switch to `count_unread_notifications` RPC.
- `src/hooks/useUnseenNotifCount.ts` — unchanged logic; relies on updated RPC.
- `src/components/notifications/ModuleNotifications.tsx` — unchanged; relies on updated RPC.
- Admin recipients page (the file that edits `notification_recipients` rows) — add Module dropdown.
- No other UI, no design changes, no change to acknowledge / read‑tracking / diff / real‑time.

## Out of scope (explicitly preserved)

Acknowledge flow, NotificationDetailDialog, NotificationDashboard layout, old/new value rendering, line‑item diff, folder column design, badge design, sidebar bell design, all module domain logic (OA/BOQ/PI/Purchase/Requisition/Design create/edit/revise paths).

## Acceptance check (will be verified after build)

1. Costing user revises OA → no row appears for that user under OA detail's "Not Seen Notifications", banner, bell, folder column. BOQ‑module and PI‑module users still see it.
2. Costing user edits a BOQ → same exclusion, but for BOQ only.
3. Design user comments → Design users excluded; OA / BOQ / PI / Purchase / Manufacturing / Requisition users see it.
4. Purchase / Manufacturing / Requisition edits exclude only their own module.
5. Top bell, badge, banner, folder column, and detail panel show identical unseen counts for the same viewer.
6. Acknowledge still decrements all surfaces in lockstep.

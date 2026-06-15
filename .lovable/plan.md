## Goal

Add two clickable donut charts to `/notifications` that filter the existing list. No schema changes, no write-logic changes.

## Layout (above existing list, below summary cards/filters)

```text
+----------------------------------+  +----------------------------------+
| Notifications by Department      |  | Pending vs Seen Notifications    |
| (donut, clickable slices)        |  | (donut, clickable slices)        |
+----------------------------------+  +----------------------------------+
[ Active: Dept = Design | Status = Pending ]  [ Clear Filter ]
[ existing notification table ]
```

Empty state for either chart when `rows.length === 0`: `No notification data available`.

## Chart 1 — Notifications by Department

- Source: existing `rows` from `app_notifications`.
- Department per notification = first value found in this order:
  1. `actor_department`
  2. `target_departments[0]`
  3. payload department: `new_value.department` or `old_value.department`
  4. fallback `"Unknown Department"`
- Group + count, sort desc.
- Click slice → set `chartDeptFilter = <dept>`; applied as an extra filter in the existing `visible` memo (matches `actor_department` OR includes in `target_departments`, case-insensitive via existing `normalizeDept`).

## Chart 2 — Pending vs Seen

- For current user `me`:
  - Seen = `myReadIds.has(n.id)` (reuses existing `app_notification_reads` logic).
  - Pending = the rest.
- Click slice → set `chartStatusFilter = "seen" | "pending"`; applied in `visible` memo alongside existing tab filter (does not replace tabs; both AND together).

## Filter chip row

- Shows active chart filters as small badges: `Dept: Design ✕`, `Status: Pending ✕` (individual clear).
- `Clear Filter` button resets both chart filters. Hidden when neither is active.
- Does NOT touch existing tab / module / dept / date / search filters.

## Click → detail dialog

Already works: row click sets `openId` which opens `NotificationDetailDialog` (the recently fixed per-line-item change details). No change needed.

## Implementation

- New file: `src/components/notifications/NotificationCharts.tsx`
  - Props: `rows`, `myReadIds`, `activeDept`, `activeStatus`, `onDeptClick(dept|null)`, `onStatusClick("seen"|"pending"|null)`.
  - Uses `recharts` `PieChart` + `Pie` (donut: `innerRadius`, `outerRadius`) + `Cell` + `Legend` + `Tooltip`. `recharts` is already a project dep (used by `components/ui/chart.tsx`).
  - Colors via existing semantic tokens (`hsl(var(--primary))`, `--chart-1..5` if present, else a small token-based palette in the component).
- Edit `src/pages/notifications/NotificationDashboard.tsx`:
  - Add `chartDeptFilter`, `chartStatusFilter` state.
  - Extend `visible` memo to AND these filters in.
  - Render `<NotificationCharts ... />` in a 2-col grid (`md:grid-cols-2`) directly above the existing `<Card>` containing the table.
  - Render active-filter chip row + `Clear Filter` button between charts and table.

## Out of scope

No DB migration, no edge function, no changes to notification write/ack logic, no changes to `NotificationDetailDialog`, no changes to OA/BOQ/PI/approval flow, no new tables.

# Department-wise Notification Summary (View-Only)

## Goal
Add a new summary box on the Notification Dashboard that lists every target department with two clickable counts — Total and Seen — and opens a read-only notification list when clicked. No acknowledge / edit / delete controls inside this box or its drill-down list.

## Where it goes
`src/pages/notifications/NotificationDashboard.tsx`, inserted between the existing top KPI cards (Total / New / Pending Ack …) and the `NotificationCharts` section. Existing KPI cards, charts, filters, main table, admin delete buttons, acknowledge flow — all unchanged.

## Box layout
A `Card` titled "Department-wise Notifications" containing a compact table:

```text
Department        Total Notifications        Seen Notifications
Sales                    120                        85
Accounts                  75                        60
Production               200                       150
HR                        40                        35
```

- Both number columns are rendered as link-styled buttons (`variant="link"`, primary color, underline on hover). Department label is plain text.
- Empty state: "No notifications yet."
- No icons, no badges, no Acknowledge / Mark-as-seen / Delete controls inside this box.

## Counting rules
For each department `D` (every value that appears in any notification's `target_departments`):
- **Total** = number of notifications where `D` ∈ `target_departments` (case/whitespace normalized via existing `normalizeDept`).
- **Seen** = number of those notifications that have at least one row in `app_notification_reads` whose `department` normalizes to `D`.

Reuses the already-loaded `rows` and `readsByNotif` — no extra queries.

## Click behavior — read-only drill-down
Clicking either number opens a new dialog `DeptNotificationsDialog` (new file `src/components/notifications/DeptNotificationsDialog.tsx`).

Props: `department: string`, `mode: "all" | "seen"`, `rows: NotifRow[]`, `readsByNotif: Record<string, ReadRow[]>`, `open`, `onOpenChange`.

Contents:
- Header: `Sales — Total Notifications` or `Sales — Seen Notifications`.
- Toolbar with two `Select`s:
  - Sort: **Latest first** (default) / Oldest first.
  - Status: **All** (default for Total mode) / Seen / Unseen. In `seen` mode the status filter is locked to Seen.
- Table columns: Module · Title · Actor · Date · Status (Seen / Unseen badge). Row click opens existing `NotificationDetailDialog` in view mode.
- No Acknowledge button, no Delete button, no inline edits anywhere in this dialog.

"Seen" inside the dialog uses the same per-department rule (any read row from department `D`).

## Out of scope (do not touch)
- Acknowledge flow on the main table or `ModuleNotifications` banner — only the owning user/department still marks notifications as seen there.
- Notification creation triggers, charts, existing summary KPI cards, admin delete buttons.
- Database schema, RLS, RPCs — purely a UI addition reading existing data.

## Files
- Edit: `src/pages/notifications/NotificationDashboard.tsx` (insert summary box + dialog state).
- New: `src/components/notifications/DeptNotificationsDialog.tsx` (read-only drill-down).
# Fix Notification Department Acknowledgement

## Root cause (verified from DB)

The acting user `it@mrengineers.com` has **no row in `notification_recipients`**, so `NotificationDetailDialog.load()` and `NotificationDashboard.load()` both fall back to `department = "Other"`. Their acknowledgement row is inserted with `department = "Other"`, which is not in any notification's `target_departments` (e.g. `["Costing","CRM Team","design","DME Team","HR","manufacturing","Project","purchase","Reception"]`).

Result: every department shows "Not Seen" even after Acknowledge, the "seen" count stays 0, and the same is true on the dashboard.

There is also a secondary risk: department comparison is strict string equality (`ackByDept.has(d)`), so any future casing/whitespace drift ("Design" vs "design") would silently break matching. And there is no unique constraint on `(notification_id, user_id)`, so a user can insert duplicate read rows.

## Fix (scope: notifications only — no changes to OA/BOQ/PI/Purchase/Mfg/Requisition/Annexure/Costing/Design logic)

### 1. Resolve the acknowledging user's department reliably

In `NotificationDetailDialog.tsx` and `NotificationDashboard.tsx`:

- Keep the current `notification_recipients` lookup as the first source.
- If no recipient row exists, look up `user_module_access` for that user and map module → department using the existing module-to-department mapping already used elsewhere in the app (re-use, don't redefine). Fall back to `"Other"` only if nothing matches.
- When the resolved department is **not in `target_departments`** for the current notification, render a small department picker next to the Acknowledge button, pre-populated from `target_departments`, so an admin or cross-functional user can record the acknowledgement on behalf of a specific department. The selected value is what gets stored on `app_notification_reads.department`.

### 2. Normalize department comparison

Add one shared helper `normalizeDept(s: string)` (lowercase, trim, collapse spaces, strip trailing " team"). Use it in:

- `DepartmentAckPanel` in `NotificationDetailDialog.tsx` when building `ackByDept` and checking `ackByDept.has(d)`.
- `deptStatus()` in `NotificationDashboard.tsx` when computing `seen` / `pending` and column "Dept Status".

This makes `design`, `Design`, `Design Team` collapse to the same key for display matching only — stored values are unchanged.

### 3. Single source of truth per (notification, user)

Migration: add `UNIQUE (notification_id, user_id)` to `app_notification_reads` and switch the inserts in `NotificationDetailDialog.acknowledge()` and `NotificationDashboard.acknowledge()` to upsert on that key. This prevents duplicate read rows when the same user clicks Acknowledge from both the dashboard and a module page.

### 4. UI updates in `DepartmentAckPanel`

Per the user's spec:

- Show `Department — Seen by <user_name> on <date/time>` when at least one read row's normalized department matches the target.
- Show `Department — Not Seen — Waiting for acknowledgement` otherwise.
- Top counters (`X total / Y seen / Z pending`) are recomputed from the same normalized match.

### 5. Dashboard counters

`NotificationDashboard.deptStatus()` already drives the "Depts Notified / Pending / Acknowledged" stat cards and per-row "Dept Status" badges; fixing it via the shared normalizer + correct department on read rows automatically corrects every count card and per-row label. No layout changes.

## Files touched

- `src/components/notifications/NotificationDetailDialog.tsx` — dept resolution, dept picker on Acknowledge, normalized matching, upsert call, new "Seen by … on …" row format.
- `src/pages/notifications/NotificationDashboard.tsx` — same dept resolution + normalized `deptStatus`.
- `src/lib/notifications/dept.ts` *(new, small)* — `normalizeDept()` and `resolveUserDepartment(userId)` helpers shared by the two files.
- One Supabase migration — `ALTER TABLE public.app_notification_reads ADD CONSTRAINT app_notification_reads_notif_user_uniq UNIQUE (notification_id, user_id);` (drops duplicates first if any exist).

## Explicitly out of scope

No edits to OA, BOQ, PI, Purchase, Manufacturing, Requisition, Annexure, Costing, or Design workflows, calculations, revisions, or approval logic. No changes to how notifications are *created* or to `target_departments`. No changes to recipient management.

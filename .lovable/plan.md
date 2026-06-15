# Admin-only delete for notifications

Add per-row delete and "Delete all" on the Notification Dashboard. Admin-only. No other module touched.

## 1. Database

New migration adding admin-only delete policies (no schema changes, no data changes):

```sql
CREATE POLICY "admins can delete notifications"
  ON public.app_notifications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete notification reads"
  ON public.app_notification_reads FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

`app_notification_reads.notification_id` already cascades from `app_notifications` (verify in the migration; if not, the second policy lets us clean it up explicitly). No other tables are touched — OA / BOQ / PI / requisitions / POs are unaffected.

## 2. UI — `src/pages/notifications/NotificationDashboard.tsx`

- Read admin flag via existing `useUserRole` hook (`isAdmin`).
- When `isAdmin`:
  - Add a small trash-icon button in each notification row's action area. On click, confirm via `AlertDialog` ("Delete this notification?"), then `supabase.from('app_notifications').delete().eq('id', n.id)`, remove from local `rows` state, toast result.
  - Add a "Delete All Notifications" button in the page header (red, destructive variant). On click, open `AlertDialog` with the exact message **"Are you sure you want to delete all notifications?"** and Confirm / Cancel. On confirm, `supabase.from('app_notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000')`, clear `rows`, toast count.
- Non-admin users: buttons not rendered. Existing read/acknowledge flow unchanged.

## 3. Out of scope

- `ModuleNotifications` banner on module pages — not part of the dashboard, no delete UI.
- Notification creation triggers, acknowledgement flow, charts, filters — unchanged.
- Any business data (orders, BOQ, PI, PO, requisitions, comments) — untouched.

## Files

- New: `supabase/migrations/<ts>_admin_delete_notifications.sql`
- Edited: `src/pages/notifications/NotificationDashboard.tsx`

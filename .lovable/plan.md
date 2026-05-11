## Goal

Add a **Delete user** action in the Admin → Users table, visible and usable only by admins. Deleting removes the user's authentication account, profile, and role assignments so they can no longer sign in.

## Plan

1. **New edge function `admin-delete-user`** (`supabase/functions/admin-delete-user/index.ts`)
   - Verifies caller via `Authorization` Bearer token (mirrors `admin-reset-password`)
   - Confirms caller has `admin` role in `user_roles`
   - Rejects self-deletion (prevents an admin locking themselves out)
   - Uses service-role client to:
     - delete from `public.user_roles`
     - delete from `public.profiles`
     - call `admin.auth.admin.deleteUser(user_id)`
   - Returns `{ ok: true }` or `{ error }`

2. **UI changes in `src/pages/admin/AdminUsers.tsx`**
   - Add a red **Delete** button next to Edit / Reset on each row
   - Hide/disable the button on the currently signed-in admin's own row
   - Open an `AlertDialog` confirmation:
     > "Permanently delete {email}? This removes their login, profile, and all role access. This cannot be undone."
   - On confirm: invoke `admin-delete-user` with `{ user_id }`, toast result, then `refresh()` the list

3. **No DB schema or RLS changes** — deletion runs through the service-role edge function.

## Out of scope

- Bulk delete, soft delete / restore, or cascading cleanup of orders/BOQ/PI authored by the user (those rows will remain with the original `user_id` but will no longer be visible to that user since they cannot sign in). Tell me if you want them reassigned or wiped — that would be a separate task.

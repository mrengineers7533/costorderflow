## Add "Create User" to Access Control (admin-only)

Extend the existing **Admin → Access Control** page (`/admin/access`) with a new **+ Add User** button, plus inline controls to disable/block users and quick-edit access. Existing per-module checkbox grid, `AdminUsers` page, edit dialog, reset-password dialog, and delete flow remain untouched.

### What admin can do from Access Control
1. **+ Add User** (top-right button) opens a dialog:
   - Email (required, validated, must be from an allowed domain)
   - Full name (optional)
   - Auth method (radio):
     - **Set password now** — type a password (min 8 chars)
     - **Send invite / reset email** — uses Supabase invite/reset link
   - Module access checkboxes (same `MODULES` list used in the grid). Optional preset shortcuts: *Purchase only*, *Manufacturing only*, *Requisition only*, *Costing only*, *Full access (admin)*.
   - Make admin? (switch) — grants `admin` role instead of per-module rows.
2. **Disable / Enable** toggle per row (uses existing `admin-set-user-active` edge function — also revokes sessions).
3. **Edit access** is already the checkbox grid; no change needed.
4. Quick links per row to existing **Edit / Reset / Delete** actions (reuse dialogs from `AdminUsers.tsx`).

### Access enforcement
- Page already sits behind `RequireAdmin`. All new mutations additionally check `useUserRole().isAdmin` client-side; server-side enforcement is handled by edge functions (service-role) and existing RLS on `user_module_access` / `user_roles` (admin-only writes).

### Backend
- **New edge function `admin-create-user`** (verify_jwt = false; validates caller is admin via JWT + service-role client):
  - Input: `{ email, full_name?, password?, send_invite?: boolean, is_admin?: boolean, modules?: string[] }`
  - Validates email domain against `allowed_domains`.
  - If `password` provided → `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`.
  - Else → `auth.admin.inviteUserByEmail(email, { data: { full_name } })`.
  - On success, inserts role row (`admin` or `user`) and any `user_module_access` rows.
  - Returns created `user_id` or structured error (e.g. `email_in_use`, `domain_not_allowed`).
- No DB migration required — uses existing `user_module_access`, `user_roles`, `profiles`, `allowed_domains` tables. `handle_new_user` trigger will auto-create the profile row.

### Frontend changes
- **`src/pages/admin/AdminAccess.tsx`**: add toolbar with **+ Add User** button and per-row Active toggle + action menu (Edit / Reset / Delete). Refresh list after mutations.
- **New `src/components/admin/CreateUserDialog.tsx`**: form described above; calls `admin-create-user` edge function; on success calls `onCreated()` to refresh.
- Reuse existing `EditUserDialog`, `ResetPasswordDialog`, delete `AlertDialog` from `AdminUsers.tsx` by extracting them into `src/components/admin/UserRowActions.tsx` (pure refactor — `AdminUsers` keeps working identically).

### Out of scope (unchanged)
- Existing `/admin/users` page, role logic, RLS policies, module gating, sidebar filtering, notifications, business workflows.

### Files
- New: `supabase/functions/admin-create-user/index.ts`, `src/components/admin/CreateUserDialog.tsx`, `src/components/admin/UserRowActions.tsx`
- Edited (additive): `src/pages/admin/AdminAccess.tsx`, `src/pages/admin/AdminUsers.tsx` (import shared row actions)

## Goal

The sidebar already links to `/admin`, but no admin pages or routes exist yet. Build a working Admin Panel that an admin (currently `it@mrengineers.com`) can use to:

- See all registered users with **full name**, **email**, **domain** (derived from email), **role**, **status**, and **created date**
- **Edit** a user (full name, role, active/inactive)
- **Reset a user's password** (admin sets a new password directly, or sends a reset email)
- See allowed **domain details** (list of allowed sign-in domains + per-domain user counts)

Only `it@mrengineers.com` (admin role) can access — `RequireAdmin` is already implemented.

## 1. Routes & shell

Edit `src/App.tsx` — add admin routes inside the existing `AuthGate` block, wrapped by `RequireAdmin`:

```
/admin                → AdminDashboard      (overview cards)
/admin/users          → AdminUsers          (list + edit + reset password)
/admin/domains        → AdminDomains        (allowed_domains CRUD + counts)
```

Use a simple sub-nav at the top of each admin page (tabs: Dashboard · Users · Domains) — no separate AdminLayout/Sidebar needed since the main `AppSidebar` already has the "Admin" entry. This keeps scope tight.

Create `src/components/admin/AdminTabs.tsx` — small header with title + 3 NavLink tabs.

## 2. New pages (`src/pages/admin/`)

### `AdminDashboard.tsx`
Stat cards (real counts via Supabase):
- Total users → `count from profiles`
- Active users → `count from profiles where is_active = true`
- Allowed domains → `count from allowed_domains`
- Admins → `count from user_roles where role = 'admin'`

### `AdminUsers.tsx`
Fetches:
- `profiles` (id, full_name, email, is_active, created_at)
- `user_roles` (user_id, role)

Joins client-side. Renders a table:

| Full name | Email | Domain | Role | Status | Created | Actions |

- **Search box** filters by name/email.
- **Domain filter** dropdown populated from `allowed_domains`.
- **Edit** button opens a Dialog with: full_name input, role select (admin/user), is_active switch. Save updates `profiles` + upserts/deletes `user_roles`.
- **Reset password** button opens a small dialog with two options:
  - "Set new password" → calls edge function `admin-reset-password` with `{ user_id, new_password }`
  - "Send reset email" → calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })` directly (works client-side, no edge function needed)

### `AdminDomains.tsx`
- Lists `allowed_domains` with a **user count** per domain (computed client-side from profiles).
- Add domain (input + button) → insert into `allowed_domains`.
- Remove button per row, disabled when `is_protected = true` (mrengineers.com) with tooltip.

## 3. Edge function: `admin-reset-password`

`supabase/functions/admin-reset-password/index.ts`

- Validates the caller's JWT and confirms `has_role(user_id, 'admin')` via a service-role query.
- Body: `{ user_id: string, new_password: string }` (zod-validated, password min 8 chars).
- Calls `supabase.auth.admin.updateUserById(user_id, { password: new_password })` using `SUPABASE_SERVICE_ROLE_KEY`.
- Returns `{ ok: true }` or 4xx with error.
- CORS headers on every response. `verify_jwt = false` (we validate the JWT manually so we can read it and call admin APIs).

Secrets needed: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — both already configured.

## 4. Database

No schema changes required. All needed tables already exist:
- `profiles` (full_name, email, is_active) ✓
- `user_roles` (role) ✓
- `allowed_domains` ✓

RLS policies already allow admins to SELECT/UPDATE `profiles` and manage `user_roles` and `allowed_domains`. Confirmed in current schema.

## 5. UX details

- Domain column is computed: `email.split('@')[1]`.
- Domains not in `allowed_domains` get a subtle amber "external" badge.
- Role change to/from admin uses an upsert into `user_roles` (delete the old row, insert the new) inside a single Promise.all.
- Password reset shows a confirmation toast and auto-closes the dialog.
- All admin actions show toast feedback (success/error) using existing `sonner`.
- "Send reset email" sends via Supabase auth — note to user: works with default email templates unless custom auth email templates are scaffolded.

## 6. Files

**Create:**
- `src/components/admin/AdminTabs.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/AdminUsers.tsx`
- `src/pages/admin/AdminDomains.tsx`
- `supabase/functions/admin-reset-password/index.ts`

**Edit:**
- `src/App.tsx` — add 3 admin routes wrapped in `RequireAdmin`.

## 7. Acceptance

- `it@mrengineers.com` visits `/admin` → sees stat cards.
- `/admin/users` lists every signed-up user with name, email, domain, role, active state.
- Admin can open Edit dialog, change name/role/status, save → table updates.
- Admin can reset any user's password (set new directly or send email).
- `/admin/domains` lists allowed domains with user counts; mrengineers.com cannot be deleted.
- Non-admin visiting any `/admin/*` route is redirected to `/`.

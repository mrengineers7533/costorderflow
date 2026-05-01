# Auth + Admin Section for MR Engineers

Wraps the existing OA/BOQ/PI app with email + password authentication, then adds a dedicated admin section at `/admin/*` for the admin user only. Existing app routes stay intact.

## Decisions locked in
- **Scope**: Auth + admin section alongside existing app (no generic Products/Analytics — those don't fit this business).
- **Sign-in**: Email + password only.
- **Admin**: `it@mrengineers.com` is the sole admin. Everyone else gets the `user` role. No public signup of admins; admin is auto-assigned on signup if the email matches.
- **Settings page**: Replace the current `/settings` placeholder with a real working page.

## What gets built

### 1. Authentication
- `/auth` — single page with **Login** and **Sign Up** tabs
  - Email + password fields
  - Sign Up adds: full name, confirm password
  - Show/hide password toggle
  - Zod validation (email format, password ≥ 6 chars, matching confirm)
  - Inline error + toast success messages
- `/forgot-password` — request reset email
- `/reset-password` — set new password (handles `type=recovery` hash)
- After login/signup → redirect to `/` (existing dashboard)
- Logout from sidebar/profile dropdown → returns to `/auth`

### 2. Route protection
- New `<ProtectedRoute>` wrapper around all existing routes (Index, orders, boqs, pi, how-to-use, settings)
- New `<AdminRoute>` wrapper around `/admin/*` — checks `has_role(uid, 'admin')`
- `/auth`, `/forgot-password`, `/reset-password` stay public
- Unauthenticated visits redirect to `/auth`; non-admins hitting `/admin/*` redirect to `/`

### 3. Top navbar (added to AppLayout)
- Keep existing GlobalSearch
- Add notifications bell (placeholder dropdown)
- Add user profile dropdown: avatar/initials, name, email, "Profile settings", "Logout"

### 4. Admin section (`/admin/*`, admin-only)
- `/admin` — Admin dashboard
  - Summary cards: Total Users, Total OAs, Total PIs, Total BOQs (live counts from existing tables)
  - Recent OAs table (last 5)
  - Recent users table (last 5)
  - Quick action buttons → New OA, New PI, Manage Users
- `/admin/users` — Users management
  - Table: name, email, role badge, created date
  - Search by name/email, filter by role
  - Promote to/demote from admin (admin only), delete user
  - "Add user" opens modal that creates a new auth user via admin API call (edge function)

### 5. Settings page (`/settings`, makes the existing menu item work)
- **Profile**: edit `full_name`, `prepared_by` in `profiles` table
- **Change password**: current → new → confirm, calls `supabase.auth.updateUser`
- **App settings** (admin only): edit company info stored in `app_settings` (key `company_profile`: name, address, GSTIN, default bank details, default T&C)
- **Notifications**: toggle email notification preferences (stored in `profiles`)

### 6. Sidebar updates
- Existing items stay (Dashboard, OAs, BOQs, PIs, How to use)
- Settings item already exists — now functional
- New **Admin** group (visible only to admin): Admin Dashboard, Users
- Logout button at the bottom

## Technical details

### Database changes (migration)
- `profiles` table: add `email TEXT`, `email_notifications BOOLEAN DEFAULT true`, `avatar_url TEXT`
- Update `handle_new_user()` trigger:
  - Insert `email` into profiles
  - If `NEW.email = 'it@mrengineers.com'` → insert `admin` role; else `user` role
- `app_settings`: keep existing `key/value/updated_at/updated_by` shape. Add INSERT/UPDATE RLS policies restricted to admins via `has_role(auth.uid(), 'admin')`.
- Backfill: insert admin role for existing `it@mrengineers.com` user if present.

### Edge function
- `admin-users` — admin-only function using service role key to:
  - List all auth users joined with profiles + roles
  - Create new user (admin invite)
  - Delete user
  - Update role
  - Validates caller is admin via JWT before any action

### Frontend files
- New: `src/pages/auth/Login.tsx`, `SignUp.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AuthPage.tsx` (tabs wrapper)
- New: `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/UsersManagement.tsx`
- New: `src/pages/Settings.tsx`
- New: `src/components/auth/ProtectedRoute.tsx`, `AdminRoute.tsx`
- New: `src/components/UserMenu.tsx`, `src/components/NotificationsBell.tsx`
- New: `src/hooks/useAuth.tsx` (session listener with `onAuthStateChange` set up before `getSession`)
- Edit: `src/App.tsx` (wrap routes, add new routes, AuthProvider)
- Edit: `src/components/AppLayout.tsx` (add UserMenu + NotificationsBell)
- Edit: `src/components/AppSidebar.tsx` (admin group, logout)

### Auth config
- Disable email confirmation (auto-confirm on) so signup → immediate login. Tell user to enable confirmation later if needed.

## Routes summary

```text
Public:
  /auth, /forgot-password, /reset-password

Protected (any signed-in user):
  / (Dashboard)
  /orders/*  /boqs/*  /pi/*
  /how-to-use
  /settings

Admin only:
  /admin
  /admin/users
```

## What will NOT be built
- Products page (you don't sell products — your domain is OAs/BOQs/PIs)
- Generic "Orders" admin page (the existing `/orders` already manages your real Order Acceptances)
- Analytics page (deferred until you tell me which metrics matter)

If you later want any of those, I'll add them in a follow-up.
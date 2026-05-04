## Goal

Replace the current generic auth screen with a polished GMS-branded login matching the attached design, enforce a domain allow-list, and add a full Admin Panel for `it@mrengineers.com` with Users, Login Activity, Domain Access, and Settings modules.

## 1. Brand assets

- Copy `user-uploads://GMS-Pvt-Ltd-150x150.png` → `src/assets/gms-logo.png` for use in the login card and sidebar header.

## 2. New Login UI (`src/components/AuthGate.tsx`)

Rebuild the `AuthForm` to match the mockup:
- Light gray page bg (`bg-muted/40`), centered white rounded-2xl card with soft shadow, max-w-md, fully responsive.
- GMS logo at top, "Welcome Back" heading, subtitle "Sign in to your account to continue".
- Email input with `Mail` icon (left), Password input with `Lock` icon + show/hide toggle (`Eye`/`EyeOff`).
- "Remember me" checkbox + "Forgot password?" link row.
- Orange full-width "Sign In" button with `LogIn` icon, disabled while submitting.
- Toggle to a matching Sign-up form (same styling, same domain rules).
- Inline error banner for: disallowed domain, invalid credentials, network errors.

Domain enforcement (client + DB):
- Allowed domains read from a new `allowed_domains` table (fallback to defaults `fmec.in`, `gmsdelhi.com`, `mrengineers.com` if fetch fails / unauthenticated).
- On submit (signin & signup), validate email domain before calling Supabase; show "This email domain is not permitted" if not in list.
- "Remember me" — when unchecked, after successful sign-in switch the Supabase session storage to `sessionStorage` for that tab (set a `lovable.remember=false` flag in `localStorage` and read it during AuthGate init to migrate the session). When checked (default), keep current `localStorage` persistence.
- Keep "Continue with Google" button (Lovable OAuth) — after redirect callback, validate email domain; if not allowed, sign out immediately and show the disallowed-domain error.

## 3. Routing & redirects

- Add a `useUserRole()` hook that returns `{ role, loading }` by querying `user_roles` for `auth.uid()`.
- After login, root `/` resolves to:
  - `it@mrengineers.com` (admin role) → redirect to `/admin`
  - All other users → existing dashboard (`Index`)
- Add a `RequireAdmin` wrapper for all `/admin/*` routes that 404s/redirects non-admins.

## 4. Admin Panel (new pages under `src/pages/admin/`)

New layout: `src/components/admin/AdminLayout.tsx` — sidebar shell distinct from main app sidebar.

Sidebar items (lucide icons): Dashboard (`LayoutDashboard`), Users (`Users`), Login Activity (`Activity`), Domain Access (`Globe`), Settings (`Settings`), Logout (`LogOut`).

Routes (added to `App.tsx`):
- `/admin` — Dashboard overview
- `/admin/users`
- `/admin/login-activity`
- `/admin/domains`
- `/admin/settings`

### 4.1 Dashboard (`AdminDashboard.tsx`)
Four stat cards using real data where possible, mock where not:
- Total Users → `count(*) from profiles`
- Active Users → `count from profiles where is_active=true`
- Pending Users → `count where is_active=false`
- Failed Login Attempts (last 24h) → `count from login_activity where status='failed'`
Recent activity preview list below.

### 4.2 Users (`AdminUsers.tsx`)
Table of `profiles` joined with `user_roles`:
- Columns: Email, Full name, Domain, Role (Admin/User), Status (Active/Inactive), Created, Actions.
- Search box (filters by email/name), domain filter dropdown.
- Add User dialog (email + role + send invite via `supabase.auth.admin` is not available client-side → use an edge function `admin-create-user`).
- Edit User dialog (name, role).
- Activate/Deactivate toggle (updates `profiles.is_active`).
- Delete user (calls edge function `admin-delete-user`).
- All admin mutations gated by `has_role(auth.uid(),'admin')` RLS.

### 4.3 Login Activity (`AdminLoginActivity.tsx`)
Table from `login_activity`:
- Columns: Email, Login time, IP/Device (placeholder text — captured from `navigator.userAgent` at login time, IP left as "—"), Status badge (success/failed).
- Filters: status (all/success/failed) and date range.

### 4.4 Domain Access (`AdminDomains.tsx`)
- Lists rows from `allowed_domains`.
- Add domain input + button (validates `*.tld` shape).
- Remove button per row, disabled for `mrengineers.com` (the admin-email domain) with tooltip "Required for admin access".

### 4.5 Settings (`AdminSettings.tsx`)
Three sections:
- Admin profile (read-only email, editable full name → updates `profiles`).
- Change password form (uses `supabase.auth.updateUser({ password })`).
- App branding card: logo upload placeholder (disabled file input + helper text), primary color shown as orange swatch (informational only).

## 5. Database changes (migration)

```sql
-- Track active/pending users
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Allowed sign-in domains
CREATE TABLE public.allowed_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  is_protected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.allowed_domains (domain, is_protected) VALUES
  ('mrengineers.com', true), ('gmsdelhi.com', false), ('fmec.in', false);
ALTER TABLE public.allowed_domains ENABLE ROW LEVEL SECURITY;
-- Authenticated users can read (so login screen can fetch list once signed in or via edge fn)
-- Admins manage:
CREATE POLICY "domains_read_auth" ON public.allowed_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "domains_admin_write" ON public.allowed_domains FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Login activity log
CREATE TABLE public.login_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed')),
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.login_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_activity_insert_any" ON public.login_activity FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "login_activity_admin_read" ON public.login_activity FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Public domain check function for pre-auth UX (returns boolean only, no row data)
CREATE OR REPLACE FUNCTION public.is_domain_allowed(_domain text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.allowed_domains WHERE lower(domain)=lower(_domain));
$$;
GRANT EXECUTE ON FUNCTION public.is_domain_allowed(text) TO anon, authenticated;
```

After login attempt (success or failure), the client inserts a row into `login_activity` capturing `email`, `status`, and `navigator.userAgent`.

## 6. Edge functions

- `admin-create-user` — verifies caller is admin via JWT, validates domain, calls `supabase.auth.admin.createUser` with service role, then sets role.
- `admin-delete-user` — verifies admin, calls `supabase.auth.admin.deleteUser`.
Both use `verify_jwt = true` and `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Files to create / edit

Create:
- `src/assets/gms-logo.png`
- `src/hooks/useUserRole.ts`
- `src/components/RequireAdmin.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/AdminUsers.tsx`
- `src/pages/admin/AdminLoginActivity.tsx`
- `src/pages/admin/AdminDomains.tsx`
- `src/pages/admin/AdminSettings.tsx`
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-delete-user/index.ts`
- New migration file (schema in §5)

Edit:
- `src/components/AuthGate.tsx` — new login UI + domain validation + remember me + activity logging.
- `src/App.tsx` — add admin routes, role-based root redirect.
- `src/components/AppLayout.tsx` — link to "Admin Panel" when current user is admin.

## 8. Acceptance checks

- Login screen visually matches mockup on desktop and mobile.
- Sign-in with `foo@gmail.com` blocked with clear error; sign-in with `x@fmec.in` works.
- `it@mrengineers.com` lands on `/admin`; any other user lands on `/`.
- Non-admin visiting `/admin/*` is redirected away.
- Admin can add/remove a test domain; cannot remove `mrengineers.com`.
- Failed and successful login attempts appear in Login Activity table.
- Remember-me unchecked → closing tab logs the user out; checked → session persists.

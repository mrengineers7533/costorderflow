# Role-Based Access Control

Add a permission layer on top of existing admin/user roles. Admins keep full access. Non-admins see only modules assigned to them by an admin.

## Modules (access units)

Each route maps to one module key:

- `dashboard` → `/`
- `orders` → `/orders/*` (Costing/OA)
- `boqs` → `/boqs/*`
- `pi` → `/pi/*`
- `workflow` → `/workflow`
- `purchase` → `/purchase/*`
- `manufacturing` → `/manufacturing/*`
- `requisitions` → `/requisitions/*`
- `raw_materials` → `/raw-materials`
- `reports` → `/reports`

Admins (role `admin` in `user_roles`) bypass all checks. The two seed admins `it@mrengineers.com` and `pc.2@mrengineers.com` are granted admin role on signup (existing `handle_new_user` trigger already handles `it@`; we extend it for `pc.2@`).

## Database

New table `user_module_access`:

- `user_id uuid` (FK auth.users, cascade)
- `module text` (one of the keys above)
- `granted_at timestamptz default now()`
- `granted_by uuid`
- PK `(user_id, module)`

RLS:
- SELECT: own rows OR admin
- INSERT/UPDATE/DELETE: admin only

Security-definer function `has_module_access(_user uuid, _module text) returns boolean` — true if admin OR row exists.

Seed rows for the requested users (insert tool, idempotent):
- `purchase1@mrengineers.com` → `purchase`
- `office.5@mrengineers.com` → `manufacturing`

Costing/requisition users aren't named yet — admin assigns them via the UI.

Trigger update: extend `handle_new_user` so `pc.2@mrengineers.com` also gets `admin`.

## Frontend

**Hook** `useUserAccess(userId)` — returns `{ isAdmin, modules: Set<string>, loading, canAccess(module) }`. Single query to `user_roles` + `user_module_access`. Realtime channel optional.

**Guard component** `<RequireModule module="purchase">` — wraps each protected route. Shows `<AccessDenied />` if not allowed (not a redirect, so deep links surface a clear message). Admins always pass.

**`App.tsx`** — wrap each module route with `RequireModule`. Dashboard left open to all signed-in users. `/admin/*` stays under existing `RequireAdmin`.

**`AppSidebar.tsx`** — filter `items` array by `canAccess(module)`. Add `module` key to each item.

**Admin UI** new page `/admin/access` (added to `AdminTabs`):
- Lists all users from `profiles` with email + name
- For each user, checkbox grid of all modules
- Toggling inserts/deletes `user_module_access` rows
- Admins shown with all boxes locked checked + "Full access" badge
- Uses existing admin patterns (same shadcn Table + Checkbox)

**Access Denied page** `src/components/AccessDenied.tsx` — simple centered card with title, message, and "Back to Dashboard" button.

## Files

New:
- `supabase/migrations/<ts>_user_module_access.sql` (table, RLS, function, trigger update)
- `src/hooks/useUserAccess.ts`
- `src/components/RequireModule.tsx`
- `src/components/AccessDenied.tsx`
- `src/pages/admin/AdminAccess.tsx`

Edited (additive only):
- `src/App.tsx` — wrap routes
- `src/components/AppSidebar.tsx` — filter nav
- `src/components/admin/AdminTabs.tsx` — add "Access" tab
- Seed data via insert tool after migration approval

## Out of scope (unchanged)

No changes to existing features, calculations, workflows, RLS on business tables, layouts, or the public token routes (`/boq-verify`, `/design-review`, `/requisition/:token`, etc.). Data-level RLS stays as-is — this is a UI/route access layer.

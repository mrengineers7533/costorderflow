## Goal
Dashboard requires explicit `dashboard` module permission. After login, non-admin users without dashboard access are redirected to their first permitted page. Direct URL access to unassigned routes stays blocked (already enforced by `RequireModule`). Admin keeps full access.

## Changes

### 1. `src/App.tsx`
Wrap the `/` route with `<RequireModule user={user} module="dashboard">` like every other module route.

### 2. `src/pages/Index.tsx`
Add a redirect gate at the top of the component:
- Read `useUserAccess(user?.id)`; while `loading`, render the existing loading state.
- If `isAdmin` or `canAccess("dashboard")` → render dashboard as today.
- Else compute `firstAllowedPath` from an ordered module→path map:
  costing→`/orders`, design→`/design`, manufacturing→`/manufacturing`, purchase→`/purchase`, requisitions→`/requisitions`, annexures→`/requisitions/annexures`, grn→`/grn`, cost_sheets→`/cost-sheets`, raw_materials→`/raw-materials`, workflow→`/workflow`, reports→`/reports`, notifications→`/notifications`.
- If a path is found → `<Navigate to={path} replace />`.
- If nothing is assigned → render `<AccessDenied />` (RequireModule on `/` will actually handle this case, but the fallback keeps the redirect logic self-contained).

### 3. `src/components/AppSidebar.tsx`
Remove the `it.module === "dashboard" ? true : ...` special case so the Dashboard link hides unless the user has `dashboard` access (or is admin). The Report & Dashboard parent group already auto-hides when `visibleReport` is empty.

## Untouched
Admin routes and admin bypass, all module features, RLS, calculations, workflows, notifications, email, OA/BOQ/PI/Purchase/Manufacturing/Requisition/Annexure logic, User Access Control admin page, existing `RequireModule` behavior for other routes.

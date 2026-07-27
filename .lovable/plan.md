## Goal

Sidebar-only change: group Requisition, Annexure Folder and Purchase under one collapsible **Purchase** section. No route, permission, or logic changes.

## Current state

`src/components/AppSidebar.tsx` renders these three as flat top-level entries in `bottomItems`:

- Requisition → `/requisitions` (module `requisitions`)
- Annexure Folder → `/requisitions/annexures` (module `annexures`)
- Purchase → `/purchase` (module `purchase`)

The file already has a proven collapsible-group pattern (Costing, Report & Dashboard): a header button toggling open state, `useEffect` auto-opening when a child route is active, and indented `MenuItem` children.

## Changes

1. Remove the three entries from `bottomItems`, keeping Design, Manufacturing, GRN, Raw Material Master where they are.
2. Add a `purchaseItems` array in the required order: Requisition, Annexure Folder, Purchase — with the same URLs, icons, and module keys as today.
3. Filter it with the existing `isAdmin || canAccess(module)` rule, so a user sees only the pages they're authorized for, and the whole Purchase group is hidden when none are visible.
4. Add a `Purchase` group header button (ShoppingCart icon) mirroring the Costing group: chevron down/up, `purchaseOpen` state, auto-open when any child route is active, children always shown when the sidebar is collapsed to icon mode.
5. Place the Purchase group after Design/Manufacturing and before GRN so the overall order stays close to today's layout.

## Active-highlight detail

`/requisitions/annexures` is a sub-path of `/requisitions`, so the existing `startsWith(url + "/")` rule would light up both rows. Requisition's match will be narrowed to exclude the annexures path so exactly one child highlights at a time. The group header highlights whenever any child is active.

## Not touched

Routes in `App.tsx`, page components, breadcrumbs inside pages, module permission keys, RLS, post-login redirect priority, notifications, and all Requisition/Annexure/Purchase business logic. Existing URLs and bookmarks keep working unchanged.

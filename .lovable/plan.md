## Goal

Inline the two "New OA" creation options (Upload Cost Sheet + Create Blank Manually) directly into the Orders page, above the orders table. Remove the standalone "New OA" entry from the sidebar so the workflow is consolidated and the layout stays clean.

## Changes

### 1. `src/components/AppSidebar.tsx`
- Remove the `{ title: "New OA", url: "/orders/new", icon: FilePlus2 }` item from the `items` array.
- Remove the now-unused `FilePlus2` import.
- Sidebar will show: Dashboard, Orders, BOQs (+ Settings in footer).

### 2. `src/pages/orders/OrdersList.tsx`
- Remove the top-right "New Order" button (since the choices now live in the page itself).
- Add a new compact section between the page title and the "All Orders" card: a 2-column grid (stacks on mobile) with two minimal choice cards:
  - **Upload Cost Sheet** — icon (Upload), "AI Powered" badge, short description, links to `/orders/new` (the existing chooser, where upload flow lives).
  - **Create Blank Manually** — icon (FilePlus2), short description, links to `/orders/new/edit`.
- Style: reuse the existing card aesthetic from `NewOrderChooser` (rounded-xl, border-border/70, soft hover), but more compact (smaller padding, smaller icon tile) so they read as header actions, not a full landing screen. Keep arrow CTA text in primary color.
- Keep everything else (superseded toggle, table) unchanged below.

### 3. Routes & `NewOrderChooser`
- No route changes. `/orders/new` (the full chooser page) remains in place and is still reachable from the "Upload Cost Sheet" card (which is the upload entry point) and from anywhere else that links to it. This avoids breaking deep links and keeps the upload UI logic untouched.

## Result

- Sidebar: cleaner — Dashboard / Orders / BOQs.
- Orders page header now surfaces both creation paths inline, so users land on `/orders` and can immediately upload a cost sheet or start blank, without an extra click into a chooser screen.
- Visual style mirrors the screenshot the user shared, but at a smaller, header-appropriate scale sitting above the orders table.

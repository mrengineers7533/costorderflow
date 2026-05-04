## Goal

Split the **Orders**, **BOQs**, and **Proforma Invoices** lists into clearly separated **MR Folder** and **GMS Folder** views (plus an "All" tab), so each company has its own folder. The underlying upload → choose format → save → reuse flow is already working end-to-end and stays unchanged.

## What changes

### 1. `src/pages/orders/OrdersList.tsx`
- Add a Tabs control above the "All Orders" table with three tabs: **All**, **MR**, **GMS**.
- Each tab shows a count badge (e.g. `MR · 12`, `GMS · 7`) computed from the loaded orders.
- The table renders the rows filtered by the active tab's format. The Format column stays for clarity.
- Persist the active tab in the URL query (`?folder=MR|GMS|all`) so deep-links and refreshes keep the view.

### 2. `src/pages/boqs/BoqList.tsx`
- Same Tabs control above the "All BOQs" table (All / MR / GMS) with counts.
- Filters both the BOQ rows in the table and the OA picker dropdown so, for example, the MR tab only offers MR OAs when creating a new BOQ.

### 3. `src/pages/pi/PiList.tsx`
- Same Tabs control above the "All Proforma Invoices" table (All / MR / GMS) with counts.
- Filters both PI rows in the table and the OA list inside the "Create PI from OA" dropdown by the active tab.

### 4. Visual polish
- Use the existing shadcn `Tabs` component (already in `src/components/ui/tabs.tsx`).
- MR tab uses the primary badge style, GMS uses secondary — matching the existing Format badges so the folders feel consistent across all three pages.
- Empty-state copy per tab (e.g. "No MR OAs yet — upload a cost sheet and choose MR").

## What does not change

- Database schema, RLS, edge functions: untouched.
- Cost-sheet upload, MR/GMS chooser, OA editor save flow, OA-numbering RPC: untouched.
- BOQ/PI creation logic: untouched — only the source OA list is pre-filtered by the active folder tab.
- Existing routes (`/orders`, `/boqs`, `/pi`) keep working; the tab is an additive query param.

## Files to edit

- `src/pages/orders/OrdersList.tsx`
- `src/pages/boqs/BoqList.tsx`
- `src/pages/pi/PiList.tsx`

## Out of scope

- Renaming sidebar entries or splitting routes into `/orders/mr` and `/orders/gms` (the tabbed view inside each page achieves the folder feel without route churn).
- Changing how OA / BOQ / PI numbers are generated.
- Touching the editor pages.

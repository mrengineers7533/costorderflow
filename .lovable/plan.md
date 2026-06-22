# Sidebar Reorganization

Only `src/components/AppSidebar.tsx` will change. No logic, routes, permissions, or modules touched — purely display order/grouping.

## New sidebar order (top → bottom)

```text
Report & Dashboard   (new collapsible group, expanded by default)
  ├─ Dashboard
  ├─ Notification Dashboard
  ├─ Flow Report
  └─ Work Flow

Costing              (existing collapsible group, unchanged)
  ├─ Orders
  ├─ BOQ
  └─ Proforma Invoices

Cost Sheet           (existing, unchanged position relative to others below)
Design
Manufacturing
Requisition          ← (was Purchase slot)
Annexure Folder      ← (was Requisition slot)
Purchase             ← (now after Annexure Folder)
GRN
Raw Material Master
```

## Changes in `AppSidebar.tsx`

1. **New `reportItems` array** containing: Dashboard, Notification Dashboard, Flow Report, Work Flow (moved out of `topItems` + `midItems`).
2. **Remove** Dashboard from `topItems`, and Notification/Flow Report/Work Flow from `midItems`. Keep `Cost Sheet` in `midItems` (or move into `bottomItems` top — will keep in `midItems` so it renders between Costing group and the bottom list, preserving current visual placement).
3. **Reorder `bottomItems`** so Requisition comes before Annexure Folder, then Purchase, then GRN, then Raw Material Master (Design + Manufacturing stay at top of bottom block as today).
4. **Add a collapsible "Report & Dashboard" group** at the very top, mirroring the existing Costing group pattern (chevron, `reportOpen` state, auto-open when any child route is active, icon = `BarChart3` placeholder from already-imported icons).
5. Unread notification badge logic stays attached to the Notification Dashboard entry (now inside the new group).
6. Module-visibility filtering (`isAdmin || canAccess`) preserved per item; the new group only renders if at least one child is visible.

Nothing else changes — no edits to routes, permissions, `modules.ts`, AppLayout, or any page.

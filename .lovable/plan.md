## Summary

Reorder the left sidebar (`src/components/AppSidebar.tsx`) so that top-level items appear in this exact sequence:

1. Dashboard
2. Notification Dashboard
3. Flow Report
4. Work Flow
5. Cost Sheet
6. Costing (collapsible parent)
   - Orders
   - BOQ
   - Proforma Invoices
7. Design
8. Manufacturing
9. Purchase
10. Requisition
11. Annexure Folder
12. GRN
13. Raw Material Master

## Changes

- Split the current single `bottomItems` array into three arrays: `midItems` (Notification Dashboard, Flow Report, Work Flow, Cost Sheet), `costingItems` (Orders, BOQ, Proforma Invoices), and `bottomItems` (Design, Manufacturing, Purchase, Requisition, Annexure Folder, GRN, Raw Material Master).
- Keep the existing `topItems` array with Dashboard.
- Render `visibleMid` between `visibleTop` and the Costing group.
- Update "BOQs" → "BOQ" and "Requisitions" → "Requisition" in labels.
- Keep the Costing group expand/collapse behaviour, active-state highlighting, unread-notification badge logic, permission filtering, and collapse footer unchanged.

## Out of scope
- No route or page changes.
- No notification logic, dashboard logic, or permission changes.
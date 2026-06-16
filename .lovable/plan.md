## Plan: Restrict Dashboard Departments to Allowed Set

### Objective
The Notification Dashboard department section currently displays every department found in the data. Restrict it to only these 9 allowed departments/categories:

- Design
- Costing
- OA
- BOQ
- PI
- Purchase
- Manufacturing
- Requisition
- Project

All other departments must be hidden from the dashboard notification box, the target-dept filter, and the department chart.

### Scope
- `src/pages/notifications/NotificationDashboard.tsx`
- `src/components/notifications/NotificationCharts.tsx`

### Changes

1. **Allowed-department whitelist**
   Add a constant `ALLOWED_DEPT_KEYS` containing the normalized (lowercase) keys of the 9 departments above.

2. **Department-wise summary card** (`NotificationDashboard.tsx`, lines 536-601)
   When iterating `target_departments` to build the summary map, skip any department whose normalized key is not in `ALLOWED_DEPT_KEYS`. Only allowed departments are rendered in the table.

3. **Target dept filter dropdown** (`NotificationDashboard.tsx`, lines 292-296)
   Filter the `allDepts` list so it only contains `"all"` plus the allowed departments. Non-allowed departments are removed from the dropdown.

4. **Department pie chart** (`NotificationCharts.tsx`)
   Filter `deptData` so only allowed departments appear as chart slices. This keeps the pie chart consistent with the summary box.

### Out of scope
- No database, RLS, or backend changes.
- No changes to the notification creation logic or target-department storage.
- No changes to the module/actor filters, table, or acknowledgement flow.

### Expected result
The dashboard notification box and chart show exactly the 9 listed departments. Any other departments (e.g., "Sales", "Finance", "Unknown Department") are not visible in the department section but remain in the underlying data.
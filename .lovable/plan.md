## Goal
Add **Project Cost Sheet Number** as a first-class identifier on the Requisitions page — visible, searchable, filterable, clickable (project view), and usable as an entry point to add additional requisitions under an existing project. No existing column, action, or workflow changes.

## Data source (no schema change needed)
- `orders.cost_sheet_number` already exists and is set when an OA is created from a Cost Sheet / Manufacturing Model.
- Each requisition links to an order via `requisitions.order_root_id` → `orders.id` (root). So the Project Cost Sheet Number for a requisition = `cost_sheet_number` on the root order.
- No migration required. The link is implicit and persistent through `order_root_id`.

## Changes by file

### 1. `src/pages/requisitions/RequisitionsList.tsx`
- Fetch `cost_sheet_number` for every `order_root_id` shown (single `orders` query keyed by root id) and build a `costSheetByRoot` map.
- Insert a new column **"Project Cost Sheet #"** between **OA #** and **BOQ #** (keeps existing columns in place).
  - Renders as a clickable link/button. Empty when the root order has no cost-sheet number.
  - Clicking it filters the list to all requisitions sharing that cost-sheet number (sets the search to `cs:<number>` and a small "Project: 001 ✕" chip is shown above the table to clear).
- Extend the existing search to also match `cost_sheet_number` so users can type a project number into the search box and find every linked requisition.
- Add a **"+ Add Requisition to Project"** button in the page header that opens a small dialog:
  - Step 1: pick an existing Project Cost Sheet Number (typeahead over distinct `cost_sheet_number`s from `orders`).
  - Step 2: pick which OA / BOQ revision under that project to base the new requisition on (list of approved BOQs whose root order has the selected cost-sheet number).
  - Step 3: confirm → reuse the existing requisition-creation path (same edge function / RPC used today by `CreateRequisitionDialog`) so the new requisition is created against that BOQ and therefore automatically inherits the same `order_root_id` and thus the same Project Cost Sheet Number.
  - Existing requisitions under that project are untouched.

### 2. `src/components/manufacturing/CreateRequisitionDialog.tsx`
- No behavior change. Already creates requisitions against an order/BOQ — the cost-sheet linkage flows through naturally.

### 3. (Optional, light touch) `src/pages/requisitions/RequisitionDetail.tsx`
- Show the Project Cost Sheet Number at the top of the detail header as read-only context. Pure display, no logic change.

## Backend
- None. No migration, no new tables, no edge function changes. Read-only joins on existing `orders.cost_sheet_number`.

## UI behavior summary
- New column **Project Cost Sheet #** visible on `/requisitions`.
- Search box matches requisition #, OA #, BOQ #, client, AND cost-sheet number.
- Clicking the cost-sheet cell filters the table to that project; a chip clears the filter.
- Header button **"+ Add Requisition to Project"** lets a user create another requisition under an existing project (e.g. project `001`).
- Multiple requisitions can share the same Project Cost Sheet Number (already supported by the data model).

## Out of scope (explicitly unchanged)
- Existing columns, status badges, row actions (view / PDF / copy link / send to purchase), bulk-plan flow, requisition generation rules, BOQ/OA/revision logic, PO PDF output.
- No new permissions, no schema migration, no changes to existing requisitions.

## Verification
- Requisitions page shows the new column populated for requisitions whose root order has a cost-sheet number.
- Typing a project number into search narrows the list to matching requisitions.
- Clicking a cost-sheet cell filters to all requisitions for that project.
- "+ Add Requisition to Project" creates a new requisition that appears under the same Project Cost Sheet Number with all other features (PDF, send to purchase, etc.) working as before.
- Requisitions whose root order has no cost-sheet number still render normally with an empty project cell.

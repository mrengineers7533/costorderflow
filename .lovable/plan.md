## Goal

Add two new sidebar entries — **Purchase** and **Manufacturing** — as base modules. Each opens its own page that lists the latest approved/updated BOQ per order family, ready for future workflow steps (raw material mapping, requisition, lot marking, manufacturing planning, PI, invoice, dispatch). No changes to OA, BOQ, approval, revision, calculation, pricing, or any existing flow.

## Changes

### 1. Sidebar (`src/components/AppSidebar.tsx`)
Add two items after "Workflow":
- `Purchase` → `/purchase` (icon: `ShoppingCart`)
- `Manufacturing` → `/manufacturing` (icon: `Factory`)

### 2. Routes (`src/App.tsx`)
Register two new routes inside the authenticated `AppLayout`:
- `/purchase` → `PurchaseList`
- `/purchase/:boqId` → `PurchaseDetail`
- `/manufacturing` → `ManufacturingList`
- `/manufacturing/:boqId` → `ManufacturingDetail`

### 3. New pages (base scaffolds only)
Create:
- `src/pages/purchase/PurchaseList.tsx`
- `src/pages/purchase/PurchaseDetail.tsx`
- `src/pages/manufacturing/ManufacturingList.tsx`
- `src/pages/manufacturing/ManufacturingDetail.tsx`

Each list page reads BOQs (read-only) and shows one row per order family using the **latest approved BOQ** (highest revision where `verification_status = 'approved'`; if none approved, the row is hidden so only approved BOQs flow into these modules). Columns: BOQ No, Revision, Company, Approved On, Items count, Total — plus an "Open" action that navigates to the detail page.

Each detail page shows a read-only snapshot of the linked BOQ items (Description, Model, Make, Qty, Unit, Rate, Amount, Remarks) and a clearly-marked "Coming soon" section with placeholder cards for the future steps:
- Raw Material Mapping
- Requisition
- Lot Marking
- Manufacturing Planning (manufacturing module only)
- PI Linkage
- Invoice
- Dispatch

The Purchase detail shows the purchase-relevant future steps; Manufacturing detail shows manufacturing-relevant ones. No buttons that mutate data.

### 4. No database, no edge functions, no calc/pricing/format changes
Pages only **read** existing `boqs` rows via the current Supabase client and reuse existing types from `src/lib/boq/types.ts`. Nothing in OA, BOQ editor, revision, PDF, Excel, or PI flows is touched.

## Out of scope (deferred per request)
Raw material mapping, requisition, lot marking, manufacturing planning, PI generation, invoice, and dispatch logic — only labeled placeholders for now.

## Technical notes
- "Latest approved BOQ" per family = group BOQs by `order_root_id` (or equivalent family key already used in `WorkflowPage`), filter to `verification_status === 'approved'`, pick max `revision_no`.
- Reuse existing currency formatter and BOQ item shape; no new utilities required.
- Both new pages are client-only React components; no schema migration.

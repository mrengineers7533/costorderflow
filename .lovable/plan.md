Rename the Manufacturing page/menu labels to "Create Requisition" while keeping all existing functionality intact.

## What will change
1. **Sidebar navigation** (`src/components/AppSidebar.tsx`)
   - Menu item title: `Manufacturing` → `Create Requisition`
   - Collapsible group label: `Manufacturing` → `Create Requisition`
   - Route stays `/manufacturing`; module key stays `manufacturing`.

2. **Page header / subtitle** (`src/pages/modules/ApprovedBoqModule.tsx`)
   - `MANUFACTURING_CONFIG.title`: `Manufacturing` → `Create Requisition`
   - `MANUFACTURING_CONFIG.subtitle`: update to reflect requisition creation, e.g. "Approved BOQs ready for requisition creation."

## What will NOT change
- `/manufacturing` route and sub-routes (`/manufacturing/boq-folder`, `/manufacturing/:boqId`).
- File names, component names, module keys, database tables, permissions.
- BOQ listing, approval status, filters, search, calculations, numbering, notifications, workflows, requisition generation logic.
- Future workflow step labels (e.g. "Manufacturing Planning") remain as-is.

## Verification
- Run TypeScript check (`tsgo --noEmit`) to confirm no type errors.
- Inspect sidebar and `/manufacturing` page header in preview to confirm the new label renders.
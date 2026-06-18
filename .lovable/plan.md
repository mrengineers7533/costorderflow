## Goal
Ensure the BOQ Folder is visible and populated with approved BOQs in both **Purchase** and **Manufacturing** modules, without changing any other business logic.

## Issues today
1. `BoqFolder.tsx` filter requires `verification_status = 'approved'` **AND** `design_review_status ∈ ('design_approved','final_sent')`. Most existing approved BOQs have `design_review_status = 'draft'`, so the folder shows empty.
2. `ApprovedBoqModule.tsx` (used by Purchase Approved list and Manufacturing list) applies the same dual filter — approved BOQs are missing from Manufacturing too.
3. Manufacturing module has no "BOQ Folder" entry point; it lands directly on Approved BOQs.

## Changes

### 1. `src/pages/purchase/BoqFolder.tsx`
Relax `pickLatestApprovedPerFamily` to only require `verification_status === 'approved'` (default `'approved'` when null). Drop the `design_review_status` check entirely. Keep latest-revision-per-family logic, search, tabs, layout unchanged.

### 2. `src/pages/modules/ApprovedBoqModule.tsx`
Same relaxation in its `pickLatestApprovedPerFamily`. Purchase Approved list and Manufacturing list will then show every approved BOQ (latest revision per family), matching the previous flow.

### 3. Add Manufacturing BOQ Folder
- Generalize `BoqFolder.tsx` to accept a `basePath` prop (`/purchase` or `/manufacturing`) used for the "Open" link and Back button; default keeps current behavior. Purchase wrapper stays as-is.
- Create `src/pages/manufacturing/ManufacturingBoqFolder.tsx` — thin wrapper rendering `<BoqFolder basePath="/manufacturing" />`.
- `src/App.tsx`: add route `/manufacturing/boq-folder` guarded by `RequireModule module="manufacturing"`.
- `src/pages/manufacturing/ManufacturingList.tsx`: add a small header link "Open BOQ Folder" → `/manufacturing/boq-folder` (no other UI changes).

### 4. Access control
No RLS / migration changes. `RequireModule` already gates by `purchase` / `manufacturing`. Admin bypass and edit-permission enforcement (added in prior migration) remain unchanged.

## Out of scope (untouched)
Approval flow, design review workflow, edit-gate RLS, notifications, revised/auto BOQ logic, PDF/print, save logic, calculations, sidebar entries, requisition/PO flows.

## Verification
- Open `/purchase/boq-folder` → approved MR/GMS BOQs visible.
- Open `/manufacturing/boq-folder` → same approved BOQs visible; "Open" routes to `/manufacturing/:boqId`.
- View-only user on Purchase can browse BOQ Folder but Save/Edit still blocked by RLS.
- Admin sees and edits everything.

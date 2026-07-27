## Goal
On the Requisition detail page: keep the Generated table exactly as-is, hide the unused tabs, and let the user pick one or more requisitions and jump straight into the existing Planning → Annexure flow.

## Verified current state
- `src/pages/requisitions/RequisitionDetail.tsx` renders 6 tabs for BOQ requisitions: Generated, Raw Materials, Machine List (`items`), Steel List (`steel`), Outside Purchase (`outside`), Consistency. The uploaded/"General" requisition branch has its own Items + Consistency tabs.
- The Planning page already exists at `/requisitions/plan?ids=a,b,c` (`src/pages/requisitions/RequisitionPlan.tsx`) and already contains the annexure creation/save flow.
- Today the only entry point is `RequisitionsList.tsx` (line 435): multi-select checkboxes → "Open Plan" → same URL.

## Changes

### 1. Hide the unused tabs (Generated only)
In `RequisitionDetail.tsx`, for the BOQ requisition branch:
- Render only the `Generated` tab trigger; remove the triggers for Raw Materials, Machine List, Steel List, Outside Purchase, Consistency.
- Stop rendering their `TabsContent` blocks (including the per-category `steel`/`outside` content map) so no data is fetched-and-shown there. The underlying data loading, state, and helper functions stay untouched — only the presentation is removed, so the tabs can be restored later by re-adding the triggers/content.
- With one tab left, drop the tab strip visual noise by keeping a single-item `TabsList` (or rendering the Generated card directly) — no change to the table itself.
- The uploaded/"General" requisition branch also loses its Consistency tab, leaving Items.

### 2. "Create Planning" from the Generated page
- Add a `Create Planning` button in the page header next to PDF/Delete.
- It opens a dialog listing selectable requisitions: the current one (pre-checked, always included) plus sibling requisitions from the same BOQ family / same order root, each shown as requisition number · BOQ revision · status.
- Checkbox multi-select, with a search box for long lists.
- Confirm navigates to `/requisitions/plan?ids=<comma separated>` — the existing Planning page then handles lots, reports and Annexure generation with zero changes to it.

## Not changed
Generated table editing, cell inputs, calculations, RM/FG relationship, numbering, PDFs, permissions, notifications, Planning page logic, Annexure pipeline, database schema, and the Requisition list's existing "Open Plan" flow.

## Technical notes
- Sibling lookup: query `requisitions` filtered by the current record's `boq_id`/`order_root_id` (falling back to `family_token`), excluding superseded rows, ordered by `requisition_number`.
- New dialog lives in a small component (e.g. `src/components/requisitions/CreatePlanningDialog.tsx`) so `RequisitionDetail.tsx` stays close to its current size and its render-stability fixes are unaffected.

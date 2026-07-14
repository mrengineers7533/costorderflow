
# Unified module-based access for non-admin users

Goal: when Admin assigns a module/page to any active user, that user gets the same working features on that page that `it@mrengineers.com` (admin) currently uses — no more per-document sharing or creator-only checks getting in the way. Access to non-assigned modules stays blocked. Admin behavior is unchanged.

## Root causes still blocking non-admin users

1. **Frontend gating is inconsistent.** `useDocAccess` was updated last turn, but several action buttons (Approve / Reject / Save comments / Upload attachments / Revise / Distribute) in `BoqEditor`, `DesignBoqView`, `OrderEditor`, `PiEditor`, `PurchaseDetail`, `RequisitionDetail` still gate on `isCreator` or on `document_access` rows only.
2. **RLS still owner-scoped on several write paths**, so even if the UI shows the button, the DB rejects the write:
   - `boq_item_attachments` INSERT/SELECT require `uploaded_by = auth.uid()` and boq owner check.
   - `boq_design_reviews` and `boq_design_review_items` SELECT are `user_id = auth.uid() OR admin` — Design user B cannot read/append to review round started by Design user A on same BOQ.
   - `boq_design_comments` UPDATE/DELETE are owner-only (fine for edit-own; but current admin can update anyone's — non-admins in same module should be allowed to at least read all comments, which SELECT already covers).
   - `boq_item_design_status` UPDATE requires only `design:view`; should require `design:edit` for consistency (tighten) but not block current work.
3. **`app_notifications` recipient policy** is fine for read; no change needed.
4. **Design-user-only INSERT policy `design users can insert comments`** is on the `public` role — must be `authenticated` (also flagged by security scan).

## Changes

### A. Database migration (RLS + helpers)

- **`boq_item_attachments`**
  - Replace SELECT policy: allow admin OR `has_doc_access(auth.uid(),'boq',boq_id,'view')` (so any costing/design/manufacturing user assigned to the BOQ module can see attachments on their BOQs).
  - Replace INSERT policy: allow admin OR `can_edit_doc(auth.uid(),'boq',boq_id,'costing')` AND `uploaded_by = auth.uid()`.
  - Keep DELETE owner-or-admin (already OK) plus module_edit_gate_del.

- **`boq_design_reviews`**
  - Replace SELECT policy: admin OR `has_doc_access(auth.uid(),'boq',boq_id,'view')` (any Design/Costing viewer sees the round).
  - Keep INSERT/UPDATE/DELETE as owner-or-admin + module_edit_gate on `design`.

- **`boq_design_review_items`**
  - Replace SELECT policy to mirror parent: admin OR viewer of the parent review's BOQ via `has_doc_access`.
  - Keep write policies as-is (owner via parent review, plus module_edit_gate).

- **`boq_design_review_documents`**, **`boq_design_review_email_log`** — mirror SELECT to `has_doc_access` of parent BOQ so shared Design users can see attachments/emails on rounds they didn't start.

- **`boq_design_comments`**
  - Change the `design users can insert comments` policy role from `public` to `authenticated`. Keep its check as-is.
  - (No functional change to who can insert.)

- **`boq_item_design_status`**
  - Tighten UPDATE to require `has_module_perm('design','edit')` (currently 'view' — cosmetic tightening; keeps admin/design-edit ability).

- Leave `orders`, `boqs`, `proforma_invoices`, `purchase_orders`, `requisitions` policies untouched — the previous turns already made them module-driven.

### B. Frontend — replace owner checks with module-permission checks

Introduce a small helper (already present via `useDocAccess`) and swap direct `user_id === session.user.id` / `isCreator` gates on action controls to `canEdit` (or `canView`) from `useDocAccess`.

Files to update:
- `src/pages/orders/OrderEditor.tsx` — Save Draft, Finalize, Revise, Apply Design Comment, Delete buttons: gate on `canEdit` from `useDocAccess('order', id)`.
- `src/pages/pi/PiEditor.tsx` — same for PI actions: `useDocAccess('pi', id)`.
- `src/pages/boqs/BoqEditor.tsx` — remove residual `isCreator` gates on Distribute/Approve/Save (last turn covered edit; audit remaining buttons).
- `src/pages/design/DesignBoqView.tsx` — Save/Approve/Reject buttons: allow when user has `design:edit` on the BOQ (via `useDocAccess('boq', id).canEdit` — mapped in hook so design→BOQ edit means comments/approval only, not item edit).
- `src/pages/purchase/PurchaseDetail.tsx` and PO editor screens — gate on `useDocAccess('purchase_order', id)`.
- `src/pages/requisitions/RequisitionDetail.tsx` and annexure screens — gate on `useDocAccess('requisition', id)`.
- `src/components/boqs/BoqItemAttachments.tsx` — enable upload when `useDocAccess('boq', boqId).canEdit`.

Sidebar and route guards already use `useUserAccess` / `RequireModule`; no change needed.

### C. Tests

Extend `src/test/moduleAccessGating.test.ts`:
- Design user (`design:view`) can read another user's design review round + comments (mock RLS SELECT paths via `useDocAccess('boq').canView === true`).
- Costing user (`costing:edit`) sees `canEdit === true` for order/pi/boq created by another user.
- Purchase user (`purchase:edit`) sees `canEdit === true` for PO created by another user.
- Requisitions user (`requisitions:edit`) sees `canEdit === true` for requisition created by another user.
- User with no module access on a doc kind sees `canView === false`.

## Technical notes

- No changes to workflows, numbering, formulas, PDF, notifications, revision carry-forward, or approval sync.
- No new features; only unlocks existing functionality behind consistent module gating.
- Admin (`it@mrengineers.com`) short-circuits via `has_role('admin')` in every helper — behavior identical.
- Migration will keep all existing policies except the ones explicitly listed; each dropped policy will be recreated in the same migration.
- Public-role → authenticated-role fix on `boq_design_comments` INSERT is a straight replacement.

## Out of scope

- New buttons, columns, or workflows.
- Changing which modules unlock which doc kinds beyond the existing `has_doc_access` mapping.
- Backfill scripts.

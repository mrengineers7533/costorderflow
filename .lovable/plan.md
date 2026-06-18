## Goal

Make View-only users truly read-only. Today `useUserAccess.canEdit(module)` exists and the sidebar/route guards honor View. But editor pages, action buttons and database policies do not check `canEdit`, so a View-only user can still save/insert/update/delete. This plan closes that gap without touching any business logic.

## What changes

### 1. Backend (RLS) — block writes for View-only users

Add a `SECURITY DEFINER` helper and wire it into existing write policies. No table structure changes, no read-policy changes.

```sql
create or replace function public.can_edit_module(_user_id uuid, _module text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.has_role(_user_id, 'admin')
    or exists (
      select 1 from public.user_module_access
      where user_id = _user_id and module = _module and permission = 'edit'
    )
$$;
```

Then, for each module-owned table, add `AND public.can_edit_module(auth.uid(), '<module>')` to the existing INSERT / UPDATE / DELETE policies' `WITH CHECK` / `USING`:

| Module | Tables guarded on write |
|---|---|
| `costing` | orders, boqs, proforma_invoices, boq_revisions, order_templates, client_copies, boq_item_attachments, boq_remarks_audit_log, boq_item_design_status (write only), proforma_invoice_documents |
| `purchase` | purchase_orders, purchase_order_rows, purchase_order_sends, purchase_order_audit, purchase_settings, vendors |
| `requisitions` | requisitions, requisition_items, requisition_lots, requisition_raw_materials, requisition_annexures, requisition_annexure_rows, requisition_distribution_log |
| `manufacturing` | fg_raw_material_map (manufacturing-owned writes only) |
| `grn` | grn_receipts |
| `raw_materials` | rm_master_uploads |
| `design` | boq_design_comments, boq_design_reviews, boq_design_review_items, boq_design_review_documents |
| `cost_sheets` | cost_sheets |
| `notifications` | notification_recipients (admin already required), order_revision_notifications (write) |

Reads are untouched, so existing visibility (creator, doc_access, approved-BOQ cross-module read) stays exactly the same.

### 2. Frontend — disable Save / Edit UI for View-only users

Add a single shared helper hook usage pattern. For each editor page, read `canEdit(module)` and:

- Disable Save / Submit / Approve / Send / Delete / Add Row / inline-edit inputs.
- Show a small "Read-only access" badge in the header so the user understands why.
- Keep the page fully viewable.

Pages to touch (UI gating only — no logic change):

- `src/pages/orders/OrderEditor.tsx` (module: `costing`)
- `src/pages/boqs/BoqEditor.tsx` (module: `costing`)
- `src/pages/pi/PiEditor.tsx` (module: `costing`)
- `src/pages/purchase/PurchaseDetail.tsx`, `PoCreateFromAnnexure.tsx`, `PoFolder.tsx` (module: `purchase`)
- `src/pages/manufacturing/ManufacturingDetail.tsx` (module: `manufacturing`)
- `src/pages/requisitions/RequisitionDetail.tsx`, `RequisitionPlan.tsx`, `AnnexureFolder.tsx` (module: `requisitions` / `annexures`)
- `src/pages/grn/GrnList.tsx` (module: `grn`)
- `src/pages/cost-sheets/CostSheetsList.tsx` upload + delete (module: `cost_sheets`)
- `src/pages/RawMaterialMaster.tsx` (module: `raw_materials`)
- `src/pages/design/DesignBoqView.tsx` comment/approve actions (module: `design`)

Admin always returns `true` from `canEdit`, so admin behavior is unchanged.

### 3. Document-level overrides remain

Existing per-document `document_access` edit grants still work independently for `orders` / `boqs` / `proforma_invoices` (a user with `costing` View but document-level Edit on a single order can still edit that one). No change there.

## Out of scope (untouched)

Calculations, approval flow, notifications, acknowledgements, revised logic, auto-BOQ, PDF/print, save payload shape, read policies, sidebar filtering, route guards, document-access dialog, admin features.

## Validation

1. Log in as a user with `purchase = view`. Open a PO → all action buttons disabled; direct API update returns RLS error.
2. Same user with `purchase = edit` → save works as before.
3. Admin user → everything works as before.
4. User with `costing = view` but document-level Edit on Order X → Order X editable, other orders read-only.

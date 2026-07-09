# Module-permission-based access across all modules

Extend the "Design users see/edit all BOQs" pattern to every module so an admin-granted **module view** permission lets a user see all documents in that module, and **module edit** lets them create/update/delete any document in it. Per-document sharing (`document_access`) stays as an extra path for users without the module perm.

## Modules → tables mapping

| Module perm | Primary tables | Child/related tables |
|---|---|---|
| `costing` | `orders`, `boqs`, `proforma_invoices` | `boq_revisions`, `boq_item_attachments`, `boq_item_design_status`, `boq_remarks_audit_log`, `boq_revision_approval_snapshots`, `proforma_invoice_documents`, `order_revision_notifications`, `client_copies`, `boq_distribution_log` |
| `design` | `boqs` (view all — already done), `boq_design_reviews`, `boq_design_review_items`, `boq_design_review_documents`, `boq_design_comments` | already broadly readable; extend edit for `design` edit perm |
| `purchase` | `purchase_orders`, `vendors` | `purchase_order_rows`, `purchase_order_sends`, `purchase_order_audit` |
| `manufacturing` | (reads `boqs`, `orders`, `requisitions`) | grants via cross-module read helper (see below) |
| `requisitions` | `requisitions` | `requisition_items`, `requisition_raw_materials`, `requisition_lots`, `requisition_distribution_log` |
| `annexures` | `requisition_annexures` | `requisition_annexure_rows` |
| `grn` | `grn_receipts` | — |
| `raw_materials` | `rm_master_uploads`, `fg_raw_material_map` | (already scoped) |
| `cost_sheets` | `cost_sheets` | — |
| `reports` | read-only across orders/boqs/pi/po/req (view perm only) | — |

## Approach

1. **Add two SQL helpers** (SECURITY DEFINER, stable, `search_path=public`):
   - `public.has_module_view(_user uuid, _module app_module)` → true if admin OR row in `user_module_access` for that module with any permission.
   - `public.has_module_edit(_user uuid, _module app_module)` → true if admin OR row in `user_module_access` with `permission='edit'`.
   (If `app_module` enum doesn't exist, use `text`.)

2. **Rewrite RLS on each primary table** with four policies:
   - `SELECT`: `has_module_view(auth.uid(), '<mod>') OR has_doc_access(...) OR created_by = auth.uid()`
   - `INSERT`: `has_module_edit(auth.uid(), '<mod>')` (or creator path)
   - `UPDATE`: `has_module_edit(...) OR existing doc-scoped edit path`
   - `DELETE`: `has_module_edit(...) OR admin`
   Keep the current admin bypass and `has_doc_access` paths so per-document sharing still works for users without the module perm.

3. **Child tables** inherit through the parent row (e.g. `purchase_order_rows` checks `has_module_view/edit('purchase')` OR access to the parent PO). Rewrite each child table's policies to add the module-perm branch alongside the existing parent-access branch.

4. **Manufacturing** module perm additionally grants read on `boqs`, `orders`, `requisitions` (view-only cross-module read) so the manufacturing workflow keeps working. No edit rights on those from `manufacturing` alone.

5. **Storage buckets**: extend `order_templates` / `rm_master_uploads` / BOQ attachment buckets to accept module-view perm on the corresponding module (already done for the two flagged ones; apply same pattern to BOQ attachments and PI/PO uploads where present).

6. **Frontend list pages** (`OrdersList`, `BoqList`, `PiList`, `RequisitionsList`, `PurchaseList`, `AnnexureFolder`, `GrnList`, `CostSheetsList`): drop the "share this doc" empty-state hint for users who already have the module perm — RLS now returns the rows directly, no client change needed beyond hiding the hint when `useUserAccess.canAccess(module)` is true.

7. **No changes** to: notification generation, approval workflow, calculations, PDF export, cost-sheet logic, numbering, activity feed, email audit.

## Delivery

- **1 migration** (large, single file) rewriting all affected policies + adding the two helpers.
- **Small frontend patch**: conditionally hide `NoSharedDocsHint` when the user already has the module permission.
- **Re-run security linter** after migration and report new findings (expect none — this widens read to authenticated users with an explicit grant, not to `anon`).

## Risks / notes

- Users with only a module **view** perm will now see every document ever created in that module, including historical/archived ones. Confirm this is intended (the design module already behaves this way).
- Per-document sharing (`document_access`) becomes redundant for users who also have the module perm, but stays functional for the "external per-doc reviewer" case.

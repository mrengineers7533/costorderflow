# Non-admin access fix: Design (view + comment + approve) & Office/OA Creator (full OA edit/revise)

Access-control only. No changes to numbering, revision logic, approval carry-forward, notifications, calculations, PDF, UI layout, or Admin behavior.

## Root causes

1. `useDocAccess` only reads `document_access` rows. Design or Office users with a valid module permission but no per-doc row get `canView=false` / `canEdit=false`, so the UI hides Save / Comment / Approve / Apply / Revise buttons even though RLS already permits the write.
2. `BoqEditor` (and equivalent Office gates) tie edit to `isCreator`. An Office user with `costing:edit` who is not the creator cannot revise or edit.
3. `boq_revision_approval_snapshots` write policy references a non-existent `'boqs'` module key. Correct Office key is `'costing'`, so snapshot refresh silently fails on Office actions.
4. `has_doc_access` DB fallback already maps design→BOQ view and costing→order/BOQ/PI — no other DB access changes needed.

## Scope (locked from Q&A)

- Office/OA Creator module key = **costing** only.
- Purchase and Requisition modules are **not** touched in this pass.
- Design remains **view-only** on BOQ item data. Comments and approvals continue through the existing Design flow.

## Changes

### A. `src/hooks/useDocAccess.ts` (rewrite body, same exports)

Compute permissions from admin + module perms + `document_access`.

Doc-kind → module mapping used only in this hook:
- `order`, `pi`: view = `costing:view`, edit = `costing:edit`
- `boq`: view = `costing:view` OR `design:view`; **edit = `costing:edit` only** (Design cannot edit BOQ items)
- `purchase_order`, `requisition`: unchanged from today (document_access only)

`canView` = admin OR module-view-match OR any `document_access` row.
`canEdit` = admin OR module-edit-match OR `document_access` row with `edit`.

### B. `src/pages/boqs/BoqEditor.tsx`

Change `canEditFull` / `canEditRemarks` from `isCreator` to `isCreator OR canEdit` (from `useDocAccess('boq', boqId)`). Locked / verified / finalized gates remain untouched. Design users still cannot edit — their `canEdit` stays false by (A).

### C. `src/pages/orders/OrderEditor.tsx` and `src/pages/pi/PiEditor.tsx`

Only where a creator-only boolean currently blocks module editors, replace `isCreator` with `isCreator OR canEdit`. No write-path logic changes; no changes to apply-comment, revise, or numbering flows.

### D. `src/components/access/NoSharedDocsHint.tsx`

Extend the module short-circuit so Office users with `costing:view` also stop seeing the "ask admin" hint on order/BOQ/PI lists.

### E. Database migration (one file)

Replace `boq_revision_approval_snapshots` write policy so writers = admin OR `has_module_access('design')` OR `has_module_access('costing')`. SELECT policy unchanged. No other RLS changes.

### F. Tests — `src/test/moduleAccessGating.test.ts`

- Design user, BOQ, no `document_access` → `canView=true`, `canEdit=false`.
- Office `costing:edit` user, order/BOQ/PI, no row → `canView=true`, `canEdit=true`.
- Non-Design/non-Office user, no perms, no row → both false.
- Admin short-circuit unchanged.

## Files touched

```text
src/hooks/useDocAccess.ts                   (rewrite body, same exports)
src/components/access/NoSharedDocsHint.tsx  (extend module map)
src/pages/boqs/BoqEditor.tsx                (canEditFull/canEditRemarks include canEdit)
src/pages/orders/OrderEditor.tsx            (only if a creator gate blocks module editors)
src/pages/pi/PiEditor.tsx                   (same targeted check)
supabase/migrations/<new>.sql               (1 policy replacement)
src/test/moduleAccessGating.test.ts         (new)
```

## Explicitly not changed

- Admin behavior anywhere.
- `has_doc_access`, `can_edit_doc`, `has_module_perm` function bodies.
- Purchase and Requisition access.
- All approval / comment / revision / snapshot carry-forward code.
- Notifications, numbering, PDF, UI layout, sidebar, routes.
- Design users' write scope on BOQ item data (still forbidden).

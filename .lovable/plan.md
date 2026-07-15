## Problem

For non-admin users (Design/Costing/Manufacturing/Purchase, etc.), the BOQ lists show duplicate rows for the same family — e.g. `26-27/GMSBOQ/0004` and `26-27/GMSBOQ/0004/R1` both appear. Admin sees the collapsed list correctly.

**Root cause:** All BOQ-list screens compute the "family key" as `orders.parent_order_id || order_id`. Non-admin `orders` RLS hides sibling revision orders, so each revision falls back to its own `order_id` and becomes its own family. The current `boq_number` fallback (only in `DesignBoqList` and `BoqRevisionHistory`) also fails here because the revised BOQ has a `/R1` suffix while the base doesn't, so the strings don't match.

## Fix (frontend-only grouping helper, no data changes)

Add a shared helper `boqFamilyKey(b, rootById)` at `src/lib/boq/familyKey.ts`:

1. If `rootById.get(b.order_id)` is set → return that root id (admin path, unchanged).
2. Else strip trailing `/R\d+` from `b.boq_number` and return that if non-empty.
3. Else strip trailing `/R\d+` from `b.reference_oa_number` and return that.
4. Else fall back to `b.order_id || b.id`.

This keeps the admin behaviour identical (step 1) and correctly collapses non-admin rows using the shared BOQ number stem.

### Screens updated to use the helper (latest-revision-per-family only in main list)

- `src/pages/design/DesignBoqList.tsx` — replace inline family key.
- `src/pages/boqs/BoqList.tsx` — replace inline family key in the collapse block. Superseded-toggle behaviour unchanged.
- `src/pages/purchase/BoqFolder.tsx` — used by Purchase and Manufacturing BOQ Folder. Replace `pickLatestApprovedPerFamily` and `familyOf` construction.
- `src/pages/modules/ApprovedBoqModule.tsx` — used by Manufacturing/Purchase approved lists. Replace `pickLatestApprovedPerFamily` and `familyOf` construction.

### History still shows all revisions

- `src/components/boqs/BoqRevisionHistory.tsx` — extend the current `boq_number` fallback: also match rows whose `boq_number` equals the current BOQ's stem (strip `/R\d+`) OR starts with `${stem}/R`. Ensures revised and base rows all appear inside history when opened from either row.
- `src/pages/boqs/BoqList.tsx` inline family panel (`loadFamilyFor`) — when the `orders` family lookup returns nothing (non-admin), fall back to loading BOQs whose `boq_number` matches the stem or `${stem}/R%` pattern.

## Not touched

Admin RLS path, approvals, comments, notifications, pending counts, access control, RLS policies, formulas, calculations, workflows, numbering, UI layout, Requisition/Annexure/PO lists (they group by their own document, not by BOQ family), edge functions, migrations.

## Verification

- Log in as `design@mrengineers.com`: GMS tab shows one row for `26-27/GMSBOQ/0004` (latest `R1`), and opening it lists both `R0` and `R1` in Revision History.
- Admin list is unchanged (still uses `parent_order_id`).
- Manufacturing and Purchase BOQ folders show one row per family for the same user.

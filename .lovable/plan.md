## Plan

1. **Create one shared BOQ grouping utility**
   - Add/extend a pure helper under `src/lib/boq/` that groups an already-permitted BOQ result set after RLS/module filtering.
   - Family key priority will be:
     1. Stable OA/BOQ family root when available from `orders.parent_order_id`.
     2. BOQ revision chain IDs from `revised_from_id` / visible sibling records when available.
     3. Case-insensitive `boq_number` base stem by removing only a trailing `/R\d+` suffix as fallback.
     4. Existing `order_id` / `id` as last resort.
   - Latest selection will compare numeric `revision` first, then `is_current`, then timestamps only as a tie-breaker.

2. **Fix the non-admin data path in all BOQ main lists**
   - Update Design BOQ list to run module-permitted BOQ rows through the shared grouping helper before tab counts, search, pending notification family IDs, and rendering.
   - Update Costing/main BOQ list to use the same grouped rows for normal main-list mode while keeping the existing superseded/history behavior intact.
   - Update Purchase and Manufacturing approved BOQ list/folder logic to use the same grouping helper after approved filtering.
   - Keep older/base revisions openable only through the existing History/Revision History components.

3. **Check BOQ-linked downstream modules without changing workflow logic**
   - Requisition and Annexure screens mostly list generated requisitions/annexures, not raw BOQ families. I will only adjust places that derive “latest BOQ per family” or BOQ-picker/list choices, using the same helper.
   - No record creation, approval, notification, email, calculation, numbering, or RLS logic will be changed.

4. **Cache/query invalidation for immediate consistency**
   - Ensure list loaders recompute grouped rows from fresh fetched data on mount/refresh.
   - Clear local grouping maps when data reloads so duplicate family rows do not persist after navigation, refresh, or login changes.

5. **Regression tests**
   - Add a pure helper test for the exact non-admin partial-`orders` case:
     - `26-27/GMSBOQ/0004` has no visible parent root.
     - `26-27/GMSBOQ/0004/R1` has a visible parent root.
     - Result must be one family row: `26-27/GMSBOQ/0004/R1`.
   - Add a non-admin/design fixture representing `design@mrengineers.com` with Design module access and verify grouped counts/search remain one row after simulated refresh/re-login.
   - Verify admin/root-based grouping behavior remains unchanged.

## Technical notes

- The current duplicate happens because the base revision can fall back to `boq:26-27/GMSBOQ/0004` while the revised row uses an OA root ID, producing two different family keys for the same family.
- The fix is to normalize grouping after module-permitted rows are loaded, so partial non-admin visibility cannot split one BOQ family into two keys.
- This will not delete, merge, update, or repair any BOQ/OA/PI records.
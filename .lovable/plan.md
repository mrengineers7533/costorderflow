## Plan: Fix missing Design approval/comment carry-forward for MROA R7

### What I found
- The working GMS case has the latest BOQ (`2026-27/GMS/0002/R9`) with:
  - applied Design comments on the latest BOQ
  - `boq_item_design_status` rows for revision 9
  - `line_items[].approval_status = approved`
- The broken MR case has R6 data, but the R7 BOQ (`MRBOQ/26-27/0007/R7`) was created with:
  - 0 copied Design comments
  - 0 copied Design approval status rows
  - no `approval_status` values on BOQ line items
- The key reason is item ID mismatch in the MR R6 BOQ: R6 status/comment rows point to older item IDs that are no longer present in the current R6 BOQ line item snapshot. The current carry-forward code only copies by exact previous item ID, so it skips everything even though the same items still exist by description/model/position.

### Fix scope
Only fix the missing Design carry-forward/display behavior. No changes to OA/BOQ numbering, formulas, validations, layout, calculations, generation workflow, or revision sequence.

### Implementation steps
1. **Make Design comment carry-forward resilient**
   - Update the carry-forward helper to remap Design comments from the previous BOQ to the new BOQ using stable item matching when old item IDs do not match:
     - first by exact item ID
     - then by description + model
     - then by description-only/position fallback for legacy MR records with blank model values
   - Preserve comment metadata: comment text, column key, applied date/time, applied user, department, and OA revision reference.

2. **Make Design approval carry-forward resilient**
   - Update `reviseBoqFromOrder` to carry `boq_item_design_status` rows forward with the same fallback matching.
   - Preserve approval status, approved by, department, approved date/time, and revision number on the new BOQ.
   - Mirror the carried status into `newBoq.line_items[].approval_status` so OA, BOQ editor, BOQ Folder, and linked BOQ places read the same approved state.

3. **Backfill the already-created broken R7 record**
   - Add a targeted database migration/data repair for `MROA/2026-27/0007/R7` only:
     - copy applied comments from the latest R6 BOQ into the R7 BOQ using the resilient matching rules
     - copy approval status rows from R6 into R7
     - update R7 BOQ line items with inherited approval status
   - This repairs the existing broken record without altering unrelated documents.

4. **Keep latest BOQ lookup stable**
   - Verify the OA and BOQ folder code continues to select the current/latest BOQ for the family.
   - If needed, make only a minimal read-selection adjustment so linked places do not display stale BOQ records.

5. **Regression test**
   - Extend the existing OA revision E2E test to include the MR legacy-ID mismatch case:
     - R6 has Design comments/status rows linked to older item IDs
     - R7 revision is created
     - test confirms comments, changes, approval status, approved by, and approved date/time are visible/carried forward on R7.

### Validation
- Run the focused revision/carry-forward tests.
- Query the database after migration to confirm `MROA/2026-27/0007/R7` has inherited comments and approval rows.
- Confirm behavior matches `2026-27/GMS/0002/R9` for OA, Design BOQ, BOQ Folder, and linked BOQ pages.
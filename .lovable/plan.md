
## Goal

Make the Design page work for any non-admin user who has been granted the `design` module by Admin exactly the way it already works for Admin. No new features, no changes to OA/BOQ revision, numbering, approval logic, comment logic, or Admin behavior.

## Scope of the fix

Only the following are changed:
- RLS policies (SELECT/INSERT/UPDATE) on Design-related tables
- SECURITY DEFINER RPCs used by the Design workflow (permission checks)
- Minor UI gating in Design pages so buttons match the user's real permissions

Nothing else is touched.

## What must work for a `design`-module user (already works for Admin)

1. `/design` list shows one latest BOQ row per OA family (MR + GMS).
2. Opening a BOQ shows the full revision history (all older revisions accessible).
3. User can add/save/edit item-wise Design comments and per-item Approve / Not-approve.
4. Those comments appear on the linked OA page for the Costing/OA owner.
5. When Costing revises the OA, the auto-created revised BOQ appears in Design's list.
6. The revised BOQ inherits previous-round Approved status and applied Design comments per item (already implemented server-side; must not be blocked by RLS for the Design user viewing it).
7. Design user can comment/approve again on the revised BOQ.

## Investigation checklist (build phase)

Read and verify only:
- `boqs`, `boq_item_design_status`, `boq_design_comments`, `boq_design_reviews`, `boq_design_review_items`, `boq_item_attachments`, `boq_revision_approval_snapshots` — SELECT/INSERT/UPDATE policies. Confirm each has an `authenticated` policy of the form `admin OR can_view_module('design') OR has_doc_access('boq', boq_id)` for SELECT, and `admin OR can_edit_module('design') OR has_doc_access('boq', boq_id, 'edit')` for comment/approval INSERT/UPDATE. BOQ line-item edits stay Costing-only (Design remains view-only on BOQ data — existing rule).
- RPCs invoked from Design UI (e.g. `apply_design_comment_to_oa`, `refresh_boq_revision_snapshot`, any carry-forward helper): ensure the internal permission check accepts `has_role(uid,'admin') OR can_view_module(uid,'design')` (or `edit` where a write is performed) instead of only admin/creator.
- `has_doc_access('boq', ...)` already grants Design users view on all BOQs — keep as is; only patch tables/RPCs that bypass it.
- Frontend gating: `useDocAccess('boq', id)` and `useUserAccess` on `DesignBoqView.tsx`, `DesignBoqList.tsx`, `DesignCommentsInline.tsx`, `RevisionsTable.tsx`. Any button hidden behind `isAdmin` that a `design:edit` user should also see must switch to `canEdit`/`canAccess('design')`. BOQ item-data edit controls remain admin/Costing only.

## Changes

1. **Migration** — Add/replace RLS policies so every Design-flow table listed above allows the pattern above. Include GRANTs already in place; only policy bodies change. Keep existing admin/creator policies intact (do not drop).
2. **Migration** — For each Design RPC that currently short-circuits on admin or creator only, widen the permission check to include `can_view_module('design')` for reads and `can_edit_module('design')` for writes (comments, per-item approval, snapshot refresh, apply-to-OA). No business logic inside the RPCs changes.
3. **Frontend** — In `src/pages/design/DesignBoqView.tsx` and any Design comment/approval component, replace `isAdmin`-only guards on Save / Approve / Bulk-approve / Submit with `canEdit` from `useDocAccess('boq', id)` (which already resolves Design edit permission). No other UI or logic changes.
4. **Tests** — Extend `src/test/moduleAccessGating.test.ts` with cases: Design edit user can save comment, toggle per-item approval, submit review, and see revised BOQ in list. Existing tests must still pass.

## Out of scope

- OA/BOQ revision engine, numbering, calculations, formulas, PDF, notifications.
- Admin-only pages and controls.
- Any new feature or UI restructure.

## Verification

- Run `vitest` for `moduleAccessGating`, `inheritedDesignApprovalConsistency`, `approvalBadgesE2E`.
- Re-run one security scan after migration; expect no new findings.

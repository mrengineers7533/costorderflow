## Goal
On the Design BOQ page, keep the per-cell comment textareas always editable. Posting Submit or approving items must not lock the comment inputs.

## Changes (single file: `src/pages/design/DesignBoqView.tsx`)

1. **Comment textareas — never disabled**
   - Replace `const disabled = alreadySubmitted;` (inside the items map) with `const disabled = false;`.
   - Result: textareas remain editable in all states (draft, changes_requested, design_approved, final_sent). Placeholder reverts to the normal "Comment on …" text.
   - Auto-save (`scheduleSave` / `saveNow` / `upsertDesignComment`) is unchanged — comments continue to persist and show on OA via the existing feature.

2. **Post Submit button — stay enabled after submit/approve**
   - Update `disabledSubmit(count, submitted, approved)` to only disable when `count === 0`. Ignore `submitted` and `approved`.
   - Allows Design to Post Submit again after a previous submit or after approval, as long as there is at least one draft comment.
   - `handlePostSubmit` logic itself is unchanged (still flushes drafts and calls `submitDesignComments`).

3. **Per-item Approve checkboxes**
   - No change to `approvalsDisabled` behavior beyond what already exists (`alreadySubmitted` only). Approval checkboxes are separate from the comment-edit lock and were not part of this request.

4. **Footer hint copy (minor)**
   - When `alreadySubmitted`, change the hint from "Comments submitted. Awaiting OA Creator…" to: "Comments submitted. You can still add more comments and Post Submit again." So the UI matches the now-unlocked behavior.
   - `designApproved` hint stays as-is (already mentions "You can still add comments…").

## Explicitly NOT changed
- `src/lib/design/comments.ts`, `src/lib/design/itemApprovals.ts`, `approveRevisedBoq`, `submitDesignComments`, `upsertDesignComment`.
- OA display of design comments (`OaCellDesignComment`, `src/lib/orders/designComments.ts`).
- Approve / Unapprove buttons, their gating, notifications, acknowledgements, revised/auto-BOQ logic.
- BOQ schema, RLS, edge functions, PDF/print/Excel, Purchase/Manufacturing/Verify/DesignReview screens.

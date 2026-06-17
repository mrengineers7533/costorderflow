Scope: `src/pages/design/DesignBoqView.tsx` only. No backend, schema, OA, Purchase, Manufacturing, PDF, notification, or calculation changes. Existing `upsertDesignComment` / `submitDesignComments` / `approveRevisedBoq` helpers are reused as-is — the OA display path and post-submit notification path are unchanged.

### Behavior change

Today, when `design_review_status === "design_approved"` (or `final_sent`), the Design page locks every comment textarea, hides the Post Submit action, and disables the per-item Approve checkboxes. The request is to keep commenting available after approval.

### Changes (Design page only)

1. **Unlock comment textareas after approval**
   - In the line-items table, replace the per-cell `disabled = alreadySubmitted || designApproved` with `disabled = alreadySubmitted` so textareas remain editable when `designApproved` is true.
   - Placeholder text and auto-save behavior unchanged.

2. **Re-enable Post Submit after approval**
   - Update `disabledSubmit(...)` so `approved` no longer forces disable; only `submitted` (changes_requested awaiting OA revision) or zero drafts disables the button.
   - `handlePostSubmit` is unchanged: it still flushes drafts and calls `submitDesignComments(id)`, which flips `design_review_status` to `changes_requested` exactly as the existing workflow expects. OA Creator is notified the same way.

3. **Add an "Unapprove for comment" action (Design-only, optional)**
   - Add a small `Unapprove` button in the sticky bottom bar, visible only when `designApproved` is true.
   - Clicking it calls a new local helper that runs a single `supabase.from("boqs").update({...}).eq("id", id)` with:
     - `design_review_status: "draft"`
     - `verification_status: "pending"`
     - `verified_at: null`
   - `status` and `is_current` are NOT touched, so the BOQ itself stays the current finalized record; only the Design review gate is reopened so the team can edit comments and Post Submit again.
   - Confirmation prompt before running. Toast on success/failure. `refresh()` after.

4. **Per-item approval checkboxes after approval**
   - Change `approvalsDisabled = alreadySubmitted || designApproved` to `approvalsDisabled = alreadySubmitted` so the team can flip an item back to Pending while preparing a new comment round. Underlying `setItemApproval` call is unchanged.

5. **Status badge + footer copy**
   - Keep the "Design Approved" badge logic as-is.
   - Update the footer hint when `designApproved` to: "Design-approved. You can still add comments or Unapprove to request another revision." (cosmetic copy only).

### Explicitly NOT changed

- `src/lib/design/comments.ts`, `src/lib/design/itemApprovals.ts`, `approveRevisedBoq`, `submitDesignComments`, `upsertDesignComment` — all reused unchanged.
- OA comment display (`OaCellDesignComment`, `src/lib/orders/designComments.ts`) — untouched, so comments continue to surface on OA exactly as today.
- BOQ schema, RLS, notification/acknowledgement edge functions, revision/auto-BOQ logic, PDF/print, Excel, Purchase/Manufacturing screens, Verify page, DesignReview page.
- The `Approve Revised BOQ` button keeps its existing gating; only an additional `Unapprove` path is added.

### Files to edit

- `src/pages/design/DesignBoqView.tsx` (only)

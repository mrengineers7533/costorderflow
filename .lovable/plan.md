## Goal
Make the "Generate Approval Link" button always enabled so users can regenerate the approval link anytime — even after a comment submission, without waiting for a BOQ save.

## Change (single, surgical)
File: `src/components/boqs/DesignReviewPanel.tsx`

Remove the `approvalGated` lock on the Approval Link button. The button stays hidden when the BOQ is locked (`design_approved` / `final_sent`), which preserves the existing post-approval flow.

- Drop the `approvalGated` variable (lines ~164–168).
- In the Approval button (lines ~199–209):
  - `disabled={!!creating || !boq.id}` (remove `|| approvalGated`)
  - Remove the gated `title` tooltip.

## Out of scope (unchanged)
- Comment link flow, OA auto-save, BOQ auto-update, revision snapshots, status transitions, RLS, edge functions, calculations.
- `isLocked` behavior after design approval / final sent stays as-is.
- No DB / migration / backend changes.

## Verification
- Submit a comment round → "Generate Approval Link" remains enabled and creates a new round.
- Generate multiple approval links in succession → each creates a new round (R+1) with no side effects on OA or BOQ data.

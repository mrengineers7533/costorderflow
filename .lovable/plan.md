## Issue
In `BoqEditor`, the right-side **Approval** column shows "Pending" for an item even when the design team has already marked it **Approved** in the current round (e.g. R3 in the screenshot — left banner shows `DESIGN APPROVAL · R3 APPROVED`, but the right column still says `Pending`).

Root cause: the sync effect in `src/pages/boqs/BoqEditor.tsx` (line ~97) only reads the latest **submitted** approval round via `fetchLatestSubmittedRound`. While a round is still in progress (some items approved, others pending), no per-item decision is mirrored to `line_items[i].approval_status`, so the right column stays "Pending".

## Fix (single surgical change)

**File:** `src/lib/boq/designReview.ts`
- Add a new read-only helper `fetchLatestApprovalRound(boqId)` that returns the latest `kind = "approval"` round + its items regardless of `status` (sent / submitted). Same shape as `fetchLatestSubmittedRound`.

**File:** `src/pages/boqs/BoqEditor.tsx`
- In the existing sync `useEffect` (lines ~95–170), replace the `fetchLatestSubmittedRound` call with `fetchLatestApprovalRound`. Drop the `latest.round.kind !== "approval"` guard (the new helper already filters).
- Keep the mapping unchanged: `approved → approved`, `change_required → rejected`, anything else → `pending`. Items with no per-item decision remain `pending`.
- Keep sibling-BOQ propagation, the same write to `boqs.line_items`, and all other surrounding logic exactly as today.

Effect: as soon as a designer marks an item **Approved** (or **Change Required**) in the current approval round, the right-side `Approval` badge in BOQ Editor reflects it on both sides — matching the inline `DESIGN APPROVAL · R3 APPROVED` banner.

## Out of scope (unchanged)
- DesignReviewPanel UI, comment flow, OA auto-save, BOQ auto-update.
- Round lifecycle, `overall_outcome`, status transitions, RLS, edge functions, calculations.
- Approval-link generation behavior (still unrestricted, per previous change).
- No DB / migration changes.

## Verification
- Open a BOQ where the latest approval round has at least one item marked Approved and others still Pending.
- Right-side `Approval` column shows `Approved` for the approved item and `Pending` for the rest — matching the inline `DESIGN APPROVAL · R{n}` banner on each row.
- Submitting the round later continues to work exactly as before.

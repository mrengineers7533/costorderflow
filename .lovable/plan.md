# BOQ Design Review Workflow Upgrade

Builds on existing tables (`boqs`, `boq_design_reviews`, `boq_design_review_items`) and the `/design-review/:token` flow. Nothing in OA→BOQ sync, calculations, or permissions changes except where the new workflow needs it.

## 1. Status lifecycle (DB)

Migration: add/extend `boqs.design_review_status` enum-like text with these values:

```
draft → sent_to_design → comments_received → changes_required
  → resubmitted → design_approved → final_sent
```

- Trigger / RPC updates `design_review_status` automatically when:
  - a review round is created (sent_to_design / resubmitted if round_no > 1)
  - reviewer submits (`comments_received` initially, then `changes_required` or `design_approved` based on overall outcome)
  - creator clicks "Send Final BOQ to Departments" (`final_sent`)
- Add column `boqs.final_share_token uuid` + `final_sent_at timestamptz` for the departmental link.

## 2. Reviewer page — per-item comment row

`src/pages/boqs/DesignReview.tsx`:

- Keep current item card, but render the **comment + Approve / Change Required / Attach** as a clearly separated row directly under each item (full-width sub-row, not side column) so it visually reads as "item → its own comment row".
- Add a sticky summary header with counts and big "Submit Review" button.
- Reviewer can still set decision per item; no change to RPC `submit_design_review_with_token`.

## 3. BOQ page — show Design comments item-wise

`src/pages/boqs/BoqEditor.tsx` + new helper in `designReview.ts`:

- After loading the BOQ, fetch the **latest submitted** review round and its items.
- In the existing Items table, add a read-only sub-row under each item showing:
  - Decision badge (Approved / Change Required / Pending)
  - Reviewer comment + design_change_note
  - Attachments (links)
  - Round number + reviewer name/date
- If no submitted round yet, show nothing extra (keeps current UI clean).

## 4. Rework / re-approval cycle

In `DesignReviewPanel.tsx`:

- When latest round status = `submitted`:
  - If outcome = `changes_required` → show prominent banner "Design requires changes" with a button **"Generate New Review Round"** (already exists; ensure it bumps `round_no` and resets statuses — already does).
  - If outcome = `approved` → show green "Design Approved" banner and reveal a new button **"Send Final BOQ to Departments"** (see §6).
- After creator updates items + saves remarks, the same panel button generates the next round; existing `createReviewRound` already increments round_no.

## 5. Final BOQ approval + departmental link

- New action **"Send Final BOQ to Departments"** (visible only when latest round outcome = `approved`):
  - Generates `final_share_token` (if not set), sets `design_review_status = 'final_sent'`, stores `final_sent_at`.
  - Copies departmental URL `/boq/final/:token` to clipboard.
- New page `src/pages/boqs/FinalBoq.tsx` + route in `App.tsx`:
  - Public read-only page (RLS policy `select using final_share_token = :token AND design_review_status = 'final_sent'`).
  - Shows BOQ header, items, remarks, PDF download.
- Migration adds the RLS policy.

## 6. Versioning (R1, R2, R3 …)

The existing `revision` column on `boqs` already exists. We surface and drive it from the new flow:

- When creator clicks **"Generate New Review Round"** after a `changes_required` outcome, also:
  - Create a snapshot row in new table `boq_revisions` (id, boq_id, revision_label `R1`/`R2`, line_items jsonb, design_review_status, snapshot_at, created_by).
  - Bump `boqs.revision` by 1; label is `R{revision}`.
- New "Versions" card on BOQ page (`BoqEditor.tsx`):
  - Table of all revisions: Label · Date · Status at snapshot · Reviewer outcome · "View" button.
  - Clicking "View" opens a read-only dialog showing that snapshot's items + design comments for that round. Current version highlighted with a primary badge.

## 7. Status badge

- Add a status pill in the BOQ header (`BoqEditor.tsx`) reflecting `design_review_status` with friendly labels (Draft, Sent to Design, Design Comments Received, Changes Required, Resubmitted to Design, Design Approved, Final BOQ Sent).

## 8. Out of scope (explicit no-ops)

- No change to OA→BOQ sync logic, BOQ calculations, OA editor, PDF generator core, or existing senior-verification flow.
- No change to existing creator/admin permissions other than the new "Send Final BOQ" action which requires creator or admin.
- The legacy "BOQ link generation" (existing `Generate Review Link`) keeps working unchanged; we only layer new behavior on top.

## Files touched

- New migration: `boqs` columns, `boq_revisions` table, RLS policies, status update trigger on `boq_design_reviews`.
- `src/lib/boq/designReview.ts` — add `fetchLatestSubmittedRound`, `sendFinalBoq`, `snapshotRevision`, types.
- `src/components/boqs/DesignReviewPanel.tsx` — banners, "Send Final BOQ" button, link copy.
- `src/components/boqs/DesignCommentsInline.tsx` (new) — renders per-item comment sub-row in BOQ table.
- `src/components/boqs/RevisionsTable.tsx` (new) — versions list + viewer dialog.
- `src/pages/boqs/BoqEditor.tsx` — wire status badge, inline comments, revisions card.
- `src/pages/boqs/DesignReview.tsx` — restructure layout so comment sits in its own row under each item.
- `src/pages/boqs/FinalBoq.tsx` (new) + route in `src/App.tsx`.

Ready to implement on approval.
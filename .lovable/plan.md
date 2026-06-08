# Per-item Instructions + Design Approval — already live

After re-reading `src/pages/boqs/DesignReview.tsx` and `src/lib/boq/designReview.ts`, all three pieces of your requirement are already wired up. No new code is required.

## What's already in place

1. **Creator attachments visible to Design**
   - `DesignReview.tsx` (line 105) calls `fetchCreatorAttachmentsByToken(token)` on load and stores results in `creatorAttachments`, keyed by `boq_item_id`.
   - For each item row, an extra row renders (lines 438–449) labelled **"Instructions:"** with each file as a clickable link (`CreatorDocLink`) that resolves via a short-lived signed URL on the private `boq-item-docs` bucket.
   - Backed by the SECURITY DEFINER RPC `get_boq_item_attachments_by_token` (joins via `boq_design_reviews` so anonymous reviewers can only see files for BOQs with an open review link).

2. **Item-wise comments**
   - Each item gets a sub-row of 5 textareas — Model, Description, Qty, Unit, Remarks (lines 404–413) — saved into `column_comments` per item on submit.
   - Reviewer can also attach their own files per item via the paperclip in the Comment cell (lines 398–402, uploaded to `design-review-docs`).

3. **Item-wise Approve / Change Required**
   - When the link is an **Approval** link (`meta.kind === "approval"`), each item row shows **Approved** and **Change** buttons (lines 376–390), plus a "Change note" textarea when Change is selected.
   - Bulk **Approve all items** / **Reset all** buttons in the card header (lines 282–314).
   - Submission goes through `submit_design_review_with_token` which persists per-item `decision`, `comment`, `column_comments`, and `design_change_note`, and rolls up the BOQ-level `design_review_status`.

## If something is not working as expected

If you are not seeing the Instructions row on the Design Review page for a specific BOQ, the most likely causes are:

- The files were uploaded **before** the Design link was sent — they should still appear; if not, the review token may have expired (the RPC only returns rows for `status='sent' AND expires_at > now()`).
- You're opening a Comment-only link generated before the attachment feature shipped — generate a fresh link from the BOQ editor.
- The link is for a different BOQ revision than the one the files were attached to (attachments are scoped to `boq_id`).

## Recommended next step

Tell me which specific BOQ / link is missing the Instructions row, or share a screenshot of the Design Review page where you expect to see them. I'll trace that exact case in the database (`boq_item_attachments` rows + the matching `boq_design_reviews` row) and fix whatever's blocking it. No speculative code changes until then.

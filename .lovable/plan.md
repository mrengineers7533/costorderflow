
# Split Design Review into Comment Link + Approval Link

Today there is a single "Review Link" and the UI infers comment-only vs approval-allowed from `round_no` (1 = comments only, 2+ = approval). The user wants the two link types to be **explicit and independent**, both generatable at any time, with status separation.

## 1. Database (one migration)

Add a `kind` column on `boq_design_reviews` so each link is unambiguously a comment link or an approval link.

```sql
alter table public.boq_design_reviews
  add column kind text not null default 'comment'
  check (kind in ('comment','approval'));

-- Backfill: round 1 → comment, round ≥ 2 → approval
update public.boq_design_reviews set kind = 'approval' where round_no >= 2;
```

Update `submit_design_review_with_token` so that for `kind = 'comment'` it:
- ignores any `decision` in the payload (always stores `pending`),
- sets `overall_outcome = 'comments'`,
- updates `boqs.design_review_status = 'review_received'` (Design Comments Received).

For `kind = 'approval'` it keeps the existing approve / change_required logic and maps status to `design_approved` or `changes_required`.

No changes to `boqs` table columns — existing `design_review_status` text already covers all required values listed in §6.

## 2. `src/lib/boq/designReview.ts`

- Extend `DesignReviewRow` with `kind: 'comment' | 'approval'`.
- Change `createReviewRound(boq, items, opts: { kind: 'comment' | 'approval'; expiryDays?: number })`:
  - Insert with the given `kind`.
  - `round_no` keeps auto-increment (shared sequence) so revision numbering stays sequential.
  - Update `boqs.design_review_status` based on `kind`:
    - `comment` → `'comment_sent'`
    - `approval` → `'approval_sent'`
- Extend `DESIGN_STATUS_LABELS` with the new values required in §6:
  `draft`, `comment_sent` → "Comment Link Sent to Design", `review_received` → "Design Comments Received", `boq_updated` → "BOQ Updated by Creator", `approval_sent` → "Approval Link Sent to Design", `design_approved`, `changes_required`, `final_sent` → "Final BOQ".

## 3. `src/components/boqs/DesignReviewPanel.tsx`

Replace the single "Generate New Review Round" button with **two distinct buttons**, always visible (enabled based on state):

- **Generate Design Comment Link** — calls `createReviewRound(..., { kind: 'comment' })`. Allowed when status is `draft`, `review_received`, `boq_updated`, or `changes_required`.
- **Generate Design Approval Link** — calls `createReviewRound(..., { kind: 'approval' })`. Recommended after creator has acted on comments; allowed in same states.

Each generated round in the rounds list shows a colored chip: **Comment** (slate) or **Approval** (indigo), alongside the existing outcome badge. Copy link button is per-round.

The "Send Final BOQ to Departments" button stays — only enabled when the **latest approval-kind round** is `approved`. Comment rounds never unlock Final BOQ.

The read-only table inside the panel keeps its current columns. Comment-link rounds will show all rows as Pending status with comments populated.

## 4. `src/pages/boqs/DesignReview.tsx` (reviewer page)

Fetch `kind` along with the meta. Drive UI from `kind`, not from `round_no`:

- `kind === 'comment'`:
  - Hide the per-item Approved / Change buttons and the `design_change_note` cell.
  - Hide the Status column and the summary counts (show only item count).
  - Keep the column-wise comment sub-row exactly as it is today.
  - On submit, send `decision: 'pending'` for every item.
- `kind === 'approval'`:
  - Show Approved / Change buttons per item (current round-2+ behavior).
  - Show change-note textarea when Change is selected.
  - The column-wise comment sub-row remains available so the reviewer can still leave per-column notes alongside the decision.

The header chip shows `Comment Round` or `Approval Round` plus the round number.

## 5. Revision history (`src/components/boqs/RevisionsTable.tsx`)

Add two columns to the table: **Comment Link** and **Approval Link**, each showing the latest matching round's status (Sent / Submitted / —) with outcome. Existing "Round" column becomes redundant — drop it. The View dialog already renders the snapshot read-only and stays unchanged.

When the creator presses either Generate button **and** a previous round exists, the panel already snapshots the current BOQ via `snapshotRevision` — extend the snapshot payload to also store `kind` of the round being snapshotted so history can render it correctly.

When the creator edits BOQ items between rounds (handled by existing autosave/save in `BoqEditor`), set `design_review_status = 'boq_updated'` on save **only if** current status is `review_received` or `changes_required`. This gives the explicit "BOQ Updated by Creator" status from §6.

## 6. Status map (final, used everywhere)

```
draft               → Draft
comment_sent        → Comment Link Sent to Design
review_received     → Design Comments Received
boq_updated         → BOQ Updated by Creator
approval_sent       → Approval Link Sent to Design
design_approved     → Design Approved
changes_required    → Changes Requested by Design
final_sent          → Final BOQ
```

## 7. Final BOQ page

No change — `FinalBoq.tsx` already reads the published snapshot. It will continue to display only after `final_sent`, which is only reachable through an Approval-kind round that returned `approved`.

## Files touched

- `supabase/migrations/<new>.sql` — add `kind`, backfill, update RPC.
- `src/lib/boq/designReview.ts` — types, `createReviewRound` signature, status labels.
- `src/components/boqs/DesignReviewPanel.tsx` — two buttons, kind chip, gating.
- `src/pages/boqs/DesignReview.tsx` — render based on `kind`, not `round_no`.
- `src/components/boqs/RevisionsTable.tsx` — Comment Link / Approval Link columns.
- `src/pages/boqs/BoqEditor.tsx` — flip status to `boq_updated` on save when applicable.

## Out of scope

- BOQ calculations, OA/PI sync, permissions, item editing UI, Final BOQ page, existing verification token flow — all untouched.
- No new tables; the existing `boq_design_reviews` + `boq_revisions` are sufficient.

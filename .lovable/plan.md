## Goal

When a new BOQ revision is approved for an order family, automatically supersede the open Requisition(s) and Annexure(s) tied to older revisions with fresh copies built from the latest BOQ, and hard-block Create-PO from anything not on the latest revision. All existing formulas, validations, RLS, and workflows are unchanged — only the "which BOQ does this point to" question is automated.

## Behaviour summary

| Stage | On BOQ approval to Rn+1 |
|---|---|
| Requisition (open, on ≤Rn, not yet closed) | Auto-close old (status='closed', superseded_by_id set). Auto-create a fresh requisition for Rn+1 using the same `create-requisition` flow. Old stays visible as historical. |
| Requisition (already closed/historical) | Untouched. |
| Annexure built from a superseded requisition (status='active') | Auto-cancel with reason `Superseded by BOQ Rn+1`. Auto-rebuild a new annexure from the freshly generated requisition's raw materials, using the existing annexure pipeline. |
| Annexure with status='cancelled' already | Untouched. |
| Annexure that already has a PO created against any of its rows | NOT auto-cancelled. Instead, banner: `BOQ revised to Rn+1 — PO already issued, manual review required`. (Protects shipping data.) |
| Create PO (from annexure or directly) | Hard-blocked unless source requisition's `boq_revision` == latest approved revision in family. Clear error toast pointing to the regenerated annexure. |

Nothing about quantities, RM mapping, lot logic, PO numbering, distribution, or permissions changes — all reuse existing code paths.

## What gets built

### 1. New edge function `supersede-on-boq-approval`
- Input: `{ boq_id }` (the just-approved BOQ).
- Verifies caller is authenticated and that the BOQ is `verification_status='approved'` and is the highest revision in its family.
- For each `requisitions` row where `order_root_id` matches the family AND `status IN ('draft','issued','in_purchase')` AND `boq_revision < latest`:
  1. Calls the existing requisition-creation logic (extracted into a shared helper) to insert a new requisition from the latest BOQ (carrying over `notes` and the same `selected_boq_item_ids` derived from the old row's `requisition_items.boq_item_id` list, so the new requisition covers the same items the user originally chose).
  2. Updates the old requisition: `status='closed'`, `superseded_by_id = <new.id>`.
  3. For each `requisition_annexures` row referencing the old requisition (`requisition_ids` array contains old id) where `status='active'`:
     - Checks if any `requisition_annexure_rows` is referenced by `purchase_order_rows` for that annexure.
     - If yes → leave it; emit a row into `activity_events` flagging "manual review" so the banner shows.
     - If no → cancel old (`status='cancelled'`, `cancel_reason='Superseded by BOQ R{n}'`, set `cancelled_at`, `cancelled_by`), then call existing annexure pipeline (`buildAnnexureFromRequisitions`) for the new requisition using the same lot numbers / plan_status filter the old annexure had.
- Returns a summary `{ requisitions_created, annexures_rebuilt, annexures_locked_for_review }`.
- Refactor: extract the body of `create-requisition` into a `lib/requisitionCore.ts` module used by both functions; behaviour identical, so RM mapping / unmapped placeholders stay exactly the same.

### 2. DB trigger (safety net)
- `AFTER UPDATE ON public.boqs` when `verification_status` transitions to `'approved'` and `NEW.revision > OLD.revision` for the family:
  - Sets `superseded_by_id` on all older open requisitions in the same family (status flag only — no RM regeneration in SQL).
  - Sets a new `requisition_annexures.needs_refresh = true` flag (new boolean column, default false) for active annexures of those requisitions that have no PO.
- This guarantees the staleness signal is correct even if the edge function call from the client never fires (e.g. tab closed mid-approval). The edge function uses these flags as its work list on next admin visit.

### 3. Client hook on BOQ approval
- After the existing approval RPC in `BoqVerify.tsx` (and any other place that flips a BOQ to `approved`, e.g. `boqs/FinalBoq.tsx`), invoke `supabase.functions.invoke('supersede-on-boq-approval', { body:{ boq_id } })` fire-and-forget with a toast: `Updating downstream Requisitions and Annexures…` → on completion show counts.
- No change to the approval flow itself; failure of the auto-supersede only logs a warning — the safety-net trigger has already flagged the rows.

### 4. Hard-block Create PO from older revision
- In `src/pages/purchase/PoCreateFromAnnexure.tsx` `handleCreate`, before insert:
  - Load the source requisition's `order_root_id` and `boq_revision`.
  - Query latest approved `boqs.revision` for that family.
  - If `requisition.boq_revision < latest` OR the annexure has `needs_refresh = true` OR `status='cancelled'`, abort with a destructive toast: `Cannot create PO: BOQ has been revised to R{latest}. Open the regenerated annexure for this lot.` and disable the Create PO button preemptively in the toolbar.
- Same guard is mirrored in any other PO entry point (`PoFolder` "+ New PO" launchers) for consistency.

### 5. UI updates (purely informational)
- `RequisitionsList` and `RequisitionDetail` — the existing `BOQ revised to Rxx` badge already exists; add a sibling badge `Superseded → <new requisition number>` (linked) when `superseded_by_id` is set. Replace the manual "Regenerate" button with "Open latest" (deep-link to the new requisition); keep "Regenerate" visible only when auto-supersede failed (i.e. `needs_refresh` flag is still true).
- `AnnexureFolder` — show `Rebuilt from BOQ R{n}` badge for new annexures, and `Locked – PO issued` badge for the manual-review case.

## Technical details

- New column: `requisition_annexures.needs_refresh boolean NOT NULL DEFAULT false`.
- `requisitions.superseded_by_id` already exists — only the writer is new.
- Trigger function `public.flag_descendants_on_boq_approval()` runs SECURITY DEFINER with `set search_path = public`. RLS unaffected because trigger context bypasses it.
- Edge function uses service-role key for cross-row writes; gated by an admin/role check identical to `create-requisition` (only requisition owner or admin can drive the rebuild for their rows; service role inside the function actually mutates).
- Shared helper `requisitionCore.ts` lives in `supabase/functions/_shared/`; both `create-requisition/index.ts` and `supersede-on-boq-approval/index.ts` import it. Pure refactor — bytes-identical behaviour for the existing `create-requisition` callers.
- No change to: PDF generation, lot numbering, RM mapping, BOQ counters, PO numbering, distribution log, design review.

## Files touched

New:
- `supabase/functions/_shared/requisitionCore.ts`
- `supabase/functions/supersede-on-boq-approval/index.ts`
- DB migration: add `requisition_annexures.needs_refresh`, add trigger + function on `boqs`.

Edited:
- `supabase/functions/create-requisition/index.ts` — delegate to shared core.
- `src/pages/boqs/BoqVerify.tsx`, `src/pages/boqs/FinalBoq.tsx` (and any other approval write site) — invoke supersede function after approval.
- `src/pages/purchase/PoCreateFromAnnexure.tsx`, `src/pages/purchase/PoFolder.tsx` — hard-block guard.
- `src/pages/requisitions/RequisitionsList.tsx`, `src/pages/requisitions/RequisitionDetail.tsx`, `src/pages/requisitions/AnnexureFolder.tsx` — supersede badges, "Open latest" link.
- `src/lib/requisition/annexurePipeline.ts` — exported helper used by the new function (no signature change; reused as-is if possible).

## Out of scope (explicitly NOT changing)

Calculations, validations, RM mapping, PDF outputs, PO numbering counters, requisition counter, distribution emails, RLS policies, sidebar/nav, delete behaviour added previously, design review/approval workflow, notifications schema.
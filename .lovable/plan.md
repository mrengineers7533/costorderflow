# Fix stale "Approved by Design" status in BOQ PDF

## Problem

`generateBoqPDF` renders each item's `it.approval_status` directly from `boq.line_items`. That field is only refreshed when a user opens **BoqEditor** (it pulls the latest approval round and writes it back to `boqs.line_items`). If the PDF is exported from anywhere else — `BoqList`, `FinalBoq`, `OrderEditor`, `RevisionsPanel`, `DistributeBoqDialog`, `FamilyBoq`, revision snapshots — the values can be stale, so items that Design has already approved still print as **Pending**.

The show/hide toggle for the column already exists (per the earlier change) and stays as-is.

## Fix

Resolve the latest per-item decision inside the PDF layer, just before rendering, so every entry point gets the same correct values without each caller having to pre-sync.

### 1. New helper `src/lib/boq/approvalSync.ts`

- `resolveLatestApprovalStatuses(boqId, items)` → returns a new `BoqLineItem[]` where `approval_status` is overridden from the latest **submitted** approval round.
- Implementation mirrors the existing sync in `BoqEditor.tsx` (lines 96–168):
  - Call `fetchLatestApprovalRound(boqId)` (already exported from `@/lib/boq/designReview`).
  - Map decisions: `approved → approved`, `change_required → rejected`, anything else → `pending`.
  - Match review rows to items by `boq_item_id` first, then by normalized `description` as fallback.
  - If no round or no match, leave the item untouched (preserves current behavior for BOQs without a review).
- Pure read-only — no writes back to the DB from the PDF path (DB sync stays the responsibility of `BoqEditor`).

### 2. Wire into `src/lib/boq/pdf.ts`

In `generateBoqPDF`, before building the table rows:

```ts
if (boq.id) {
  try {
    const synced = await resolveLatestApprovalStatuses(boq.id, boq.line_items);
    boq = { ...boq, line_items: synced };
  } catch (e) { console.warn("approval status resolve failed", e); }
}
```

That's the only change to the PDF renderer. The existing `showApproval` opt-in, column layout, color coding, and "Pending/Approved/Rejected" mapping all stay identical.

### 3. No other call sites change

`BoqList`, `FinalBoq`, `BoqEditor`, `OrderEditor`, `RevisionsPanel`, `DistributeBoqDialog`, `FamilyBoq`, and `revisions/index.ts` keep calling `generateBoqPDF` exactly as today; they automatically get the corrected status.

For revision-snapshot PDFs (`revisions/index.ts`) the same lookup applies — snapshots use the parent `boq.id`, so they'll also reflect the latest approval round, which matches the requirement that the PDF "should display the latest/current item status."

## Out of scope

- BOQ on-screen table, totals, GST, calculations.
- Approval workflow itself (`BoqVerify`, `DesignReview`, `fetchLatestApprovalRound`).
- OA/PI/Requisition PDFs and their approval mirrors.
- Show/hide toggle UI and `boq.pdf.approval` localStorage (already implemented).
- Persisting the resolved status back to `boqs.line_items` from the PDF path.

## Files touched

- **Add** `src/lib/boq/approvalSync.ts`
- **Edit** `src/lib/boq/pdf.ts` (one await + import at the top of `generateBoqPDF`)

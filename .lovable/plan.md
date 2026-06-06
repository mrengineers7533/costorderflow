## Problem

For BOQ `26-27/GMSBOQ/0007`, the Design Review screen shows item 1 (Destoner SGA-13) as **Approved** in Round 1 (`boq_design_review_items.decision = 'approved'`), but the downloaded PDF still prints **Pending** under "Approved by Design".

DB check confirms:
- `boqs.line_items[0].approval_status = 'pending'` (stale snapshot)
- `boq_design_review_items` row for the same `boq_item_id` has `decision = 'approved'`

The previous fix added `resolveLatestApprovalStatuses` inside `generateBoqPDF`, but only on the in-memory `boq` object passed to the PDF. It does not write the resolved value back to `boqs.line_items`, and other surfaces (Excel export, distribution email PDF, on-screen BOQ preview, revision-row PDFs whose snapshot is identical) keep showing the stale value. If the in-memory BOQ used by the PDF caller is itself stale (e.g. `BoqList.handleDownload(b)` where `b` was loaded once on page mount and never refreshed), the user can still see Pending if any caller bypasses the resolver.

## Fix

Only touch the approval-status resolution path. No UI, workflow, layout, or other column changes.

### 1. Make the resolver write-through (one place)

In `src/lib/boq/approvalSync.ts`, after building the new items array, if any item's `approval_status` actually changed, persist the corrected `line_items` back to `boqs` for that `boqId`:

```ts
if (changed) {
  await supabase
    .from("boqs")
    .update({ line_items: nextItems } as never)
    .eq("id", boqId);
}
```

- Read-with-write-through, not a new write path. Mirrors what `BoqEditor` already does on load.
- Wrapped in try/catch so a write failure (e.g. RLS for a viewer who only has SELECT) never breaks PDF rendering — it still returns the corrected in-memory items.
- No change to the mapping rules (`approved → approved`, `change_required → rejected`, else `pending`) and no change to the matching keys (`boq_item_id` first, normalized `description` fallback).

Result: the very first time **any** PDF is generated after the designer approves an item, the BOQ row is healed. Every subsequent surface (on-screen table, Excel, distribution PDF, revision list, etc.) reads the corrected snapshot.

### 2. Ensure every PDF caller benefits

`generateBoqPDF` already calls `resolveLatestApprovalStatuses` when `showApproval` is true. Confirm and keep that single integration point — no caller-side changes needed in `BoqList`, `BoqEditor`, `FinalBoq`, `FamilyBoq`, `OrderEditor`, `RevisionsPanel`, `DistributeBoqDialog`, or `revisions/index.ts`.

For the distribution path (`src/lib/boq/pdfDistribution.ts`), it already forwards `showApproval` to `generateBoqPDF`, so no edit is required there either.

### 3. Out of scope

- Excel export (`buildBoqXlsx`) — separate column visibility; not in this request.
- `exportDesignReviewRoundPDF` in `DesignReviewPanel` — that PDF reads round items directly and is already correct.
- BOQ on-screen verification badge, totals, GST, or any approval workflow logic.
- Schema, RLS, or migrations.

### Files touched

- `src/lib/boq/approvalSync.ts` — add the conditional `boqs.update({ line_items })` write inside the existing function.

No other files change.

### Verification

1. Open BOQ `26-27/GMSBOQ/0007` in BoqEditor or BoqList.
2. Click **Download PDF** with the "Approved by Design" column toggle on.
3. Expected: item 1 (Destoner SGA-13) prints **Approved**; remaining items print **Pending**.
4. Re-open the BOQ — the on-screen Approval column also reflects **Approved** for item 1 (because `boqs.line_items` was healed).
5. Subsequent Excel export and distribution PDF read the same corrected snapshot.

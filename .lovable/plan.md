
## Problem

After OA revision, Design comments / changes / approval no longer show up on the revised OA (R7) or revised BOQ. Auto-save also fails silently in some cases. Existing OA → BOQ revision, numbering, formulas, validation, and UI must not change — only the missing carry-forward + visibility behavior is restored.

Root causes found while exploring the code:

1. `reviseOrder` in `src/lib/revisions/index.ts` calls `stripOrderForInsert(source)` using whatever OA record the user revised from. If the user opens R6, applies a Design comment in the editor but does not click Save before Revise, R7 is built from R6's stored content (pre-apply), not the latest applied values. Comments themselves are tied to the linked BOQ revision via `boq_design_comments`, so they only carry forward through `carryForwardAppliedDesignComments`, which is gated on `applied_to_oa_at IS NOT NULL`. If the comment was applied locally in the editor but never persisted via the `apply_design_comment_to_oa` RPC for that BOQ id, it is treated as a draft and dropped.
2. `reviseBoqFromOrder` already calls `carryForwardAppliedDesignComments`, but the OA-revision path runs `reviseOrder → reviseBoqFromOrder(newOrderRec, currentBoq)` where `currentBoq` is the *current* BOQ found via `is_current` on family ids. If the BOQ that owns the applied comments isn't `is_current` (e.g. user reopened an older BOQ), the comments don't get carried forward.
3. `DesignBoqView.saveNow` swallows comment-save errors when `boq.design_review_status` flip-back fails, leaving the comment unsaved silently. The 600ms debounce can also be skipped when the user clicks "Approve / Send" before the timer fires; `handlePostSubmit` flushes drafts, but `handleApprove` does not.
4. OA editor's `OaCellDesignComment` displays the comment + "Applied" timestamp but never surfaces the Design approval status / approver / approval date for the OA row, so even when carry-forward works, the OA reads as un-approved.

## Fix scope (frontend + revision helper only — no schema, no workflow changes)

### 1. Design BOQ auto-save hardening — `src/pages/design/DesignBoqView.tsx`
- In `handleApprove`, mirror `handlePostSubmit`: flush `debounceRef` timers and `await Promise.all` of pending `upsertDesignComment` calls before calling the approve RPC.
- In `saveNow`, separate the comment-upsert try/catch from the BOQ status flip-back so a status-update failure cannot mask a successful comment save (and vice-versa). Toast only the failing step.
- Add a `beforeunload` flush that fires pending `saveNow` calls synchronously via `navigator.sendBeacon`-style fallback (use existing `upsertDesignComment` in an awaited `Promise.allSettled` inside an `unload` handler — best-effort).

### 2. OA editor — make the latest applied comment + Design approval visible
- `src/components/orders/OaCellDesignComment.tsx`: extend the props to optionally accept `approval?: { status: "approved" | "pending" | "not_approved"; by?: string | null; at?: string | null }`. When `approval.status === "approved"` render a small "✓ Approved by {by} on {date}" line under the comment. No layout change otherwise.
- `src/pages/orders/OrderEditor.tsx`: build a `designApprovalByOaItemId` map from `boq_item_design_status` (already populated by the Design page) joined through `oaToBoqItemId`, and pass the matching entry into each `<OaCellDesignComment approval=…>` call. Read uses one extra `supabase.from("boq_item_design_status").select(...)` keyed on `currentBoq.id` + `currentBoq.revision`. No write/format changes.

### 3. OA revise must capture the in-editor "applied" state — `src/pages/orders/OrderEditor.tsx`
- Where the "Revise" button is wired, change the handler to first call the existing Save path (the same code that runs when clicking Save) and only then call `reviseOrder(savedRecord)`. This guarantees `reviseOrder` reads R6's *latest applied* content, not the stale loaded copy.
- Do not change `reviseOrder`'s signature or `stripOrderForInsert` — only ensure the source argument is fresh.

### 4. Carry forward applied Design comments even when BOQ isn't the family's current — `src/lib/revisions/index.ts`
- In `reviseOrder`, when locating the BOQ to auto-revise, prefer (in order): (a) the BOQ whose `order_id === source.id` and is the highest-revision BOQ for that OA row, (b) the family's `is_current` BOQ (existing behavior). Pass that BOQ to `reviseBoqFromOrder`, so carry-forward draws from the BOQ the user was actually commenting on.
- In `carryForwardAppliedDesignComments`, additionally include comments whose `applied_to_oa_at IS NULL` **only if** a row with the same `(boq_item_id, column_key)` exists in the parent OA's `line_items` with a matching applied value — i.e. it was applied in the editor and saved on the OA but the RPC stamp didn't fire. Implemented as a small post-filter in `buildAppliedCommentInserts` accepting an optional "applied keys" set; the helper stays pure and the new branch is opt-in (no behavior change for callers that don't pass it).
- No SQL migration, no enum/grant changes.

### 5. Linked-module visibility (read-only)
- The carry-forward already makes the new BOQ revision (auto-marked `is_current`) own the inherited comments + per-item approval rows. The existing readers in Manufacturing / Requisition / Annexure / Purchase already resolve "latest BOQ" via `is_current`, so once steps 1–4 land they will display the right comment/approval automatically. No edits needed in those modules.

### 6. Tests — extend `src/test/designCommentsCarryForward.test.ts`
- Add cases proving:
  - Comments with `applied_to_oa_at = null` but matching applied-key set still get carried forward.
  - The BOQ-selection preference (per-OA-row latest > family is_current) returns the right BOQ id when both exist.
- Re-run vitest to confirm green.

## Out of scope (explicitly NOT changed)

- OA → BOQ generation logic, BOQ formula/calc, revision numbering, validation, RLS, notifications, UI layout, sidebar, workflow status flow.

## Technical notes

```
reviseOrder(source)
  ├── (NEW) source = await saveOrderIfDirty(source)
  ├── insert R(n+1) from source           ← unchanged code path
  └── auto-revise BOQ
        ├── (NEW) pickBoqForCarryForward(source.id, family)
        └── reviseBoqFromOrder(newOrder, prevBoq)
              └── carryForwardAppliedDesignComments(prevBoq.id, newBoq.id, map, appliedKeys?)
```

Files touched:
- `src/pages/design/DesignBoqView.tsx`
- `src/components/orders/OaCellDesignComment.tsx`
- `src/pages/orders/OrderEditor.tsx`
- `src/lib/revisions/index.ts`
- `src/lib/revisions/carryForward.ts`
- `src/test/designCommentsCarryForward.test.ts`

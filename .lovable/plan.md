# Auto-Unapprove BOQ When Design Comment is Added/Edited

## Goal
On the Design BOQ page only: if BOQ is currently `design_approved` (or `final_sent`) and the Design user actually adds or edits a comment in any cell, automatically flip the BOQ back to unapproved so they can review and Approve again.

## Scope
File: `src/pages/design/DesignBoqView.tsx` only. No backend, schema, RLS, notification, OA display, PDF, Purchase, Manufacturing, or other-screen changes.

## Behavior

1. Trigger condition — fires only when:
   - `designApproved === true` at the moment of save, AND
   - The new comment value differs from what was previously saved for that cell (real add/edit, not just opening the page or typing then reverting), AND
   - The save actually persists (inside `saveNow`, after successful `upsertDesignComment`).

2. On trigger:
   - Call the same unapprove mutation already used by `handleUnapprove`:
     ```
     supabase.from("boqs").update({
       design_review_status: "draft",
       verification_status: "pending",
       verified_at: null,
     }).eq("id", id)
     ```
   - Show a toast: "BOQ unapproved — comment added. Review and Approve again when ready."
   - Call `refresh()` so `boq.design_review_status` reflects the new state and the UI updates (Approve button re-enables per existing `canApprove` rules, "Approved" badge clears).
   - Guard with a local `autoUnapprovingRef` so concurrent saves don't fire it twice.

3. Baseline tracking:
   - Add a `savedValuesRef: Record<key, string>` populated during `refresh()` from the user's existing comments (mirrors current draft hydration).
   - In `saveNow`, after a successful upsert, compare `value` vs `savedValuesRef.current[k]`. If `designApproved` and they differ → trigger auto-unapprove, then update `savedValuesRef.current[k] = value`.

4. Untouched:
   - `upsertDesignComment`, `submitDesignComments`, `approveRevisedBoq`, item approvals logic, debounce timing, draft hydration, OA comment visibility, Post Submit / Approve buttons, manual Unapprove button, notifications, revision logic, PDF/print.
   - Comment textareas stay always-editable (already in place).
   - Per-item Approve checkboxes are NOT auto-flipped; only the BOQ-level approval status changes.

## Edge cases
- Typing then deleting back to original value → no change vs baseline → no unapprove.
- BOQ not yet approved → no-op (current flow unchanged).
- Network failure on the unapprove update → toast error; comment save still succeeds; user can use manual Unapprove.

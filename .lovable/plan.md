## Goals

1. Fix the error when Design Team submits the review link.
2. Show Design Team feedback (comments + approval decision) **row-wise** under each line item in both **OA Editor** and **BOQ Editor**.
3. Do not touch pricing, calc, OA flow, or any other feature.

---

## 1. Fix Submit error on Design Review link

**Root cause:** In `src/pages/boqs/DesignReview.tsx` the submit call sends:

```ts
_reviewer_email: contact.includes("@") ? contact : (reviewerName + " <no-email>")
```

When the reviewer leaves the "Email or Mobile" field empty or enters only a phone number, the RPC `submit_design_review_with_token` raises **"Invalid reviewer email"** because the string fails the email regex.

**Fix (frontend only):**
- If `contact` contains `@` → send as-is (validated by RPC).
- Otherwise send a safe synthetic placeholder `noemail@noemail.local` so the RPC passes validation, and store the actual phone/contact in the existing `_reviewer_contact` parameter (already passed).
- Update the field hint to clarify that email is optional but recommended.

No DB/RPC changes required — submit will work for both email and non-email reviewers, and the original contact value is still saved on the review row.

---

## 2. Row-wise Design feedback in BOQ Editor

`src/pages/boqs/BoqEditor.tsx` → `BoqItemsList` currently renders just the item grid (a comment explicitly says inline suggestions were moved to OA). Re-introduce inline display **without removing the OA version**.

Under each BOQ row, render a new compact `BoqDesignSuggestionRow`:
- Pulls the latest submitted review via existing `useLatestDesignReview(boqId)`.
- Matches the row using existing `findReviewItemForOaItem(reviewItems, item, idx)` helper (works for any item with `description` + index).
- Shows, when present:
  - **Per-column comments** (Model / Description / Qty / Unit / Remarks) via `parseColumnComments`, each with an **Apply → BOQ** button that calls the existing `onUpdate(id, patch)` so all related fields (Model, Description, Qty, Unit, Remarks) remain visible/editable.
  - **Approval decision badge** (Approved / Change Required / Pending) and the reviewer's **Change Note** when the latest round is of kind `approval`.
  - Round number + reviewer name (small caption).
- Pure UI block — no impact on calculations or BOQ save flow.

Edit only inside `BoqItemsList` (props extended with `boqId` already present and `onUpdate`). Show/hide automatically if no matching review item or no content to display.

---

## 3. Approval decision row in OA Editor

`OaDesignSuggestionRow` (in `src/pages/orders/OrderEditor.tsx`) already shows column comments row-wise. Extend it (no calc changes) so that when the latest round is an **approval** round, it also renders:
- A small status pill: **Approved** / **Change Required** / **Pending** from `reviewItem.decision`.
- The reviewer's **Change Note** (`reviewItem.design_change_note`) when present.

This ensures the approval link result is visible below the related OA row, matching the BOQ side.

---

## 4. Preserve OA fields on update

No code change needed — the existing `onApply` in `OaDesignSuggestionRow` already calls `onApply({ field: value })` which spreads into the current item, keeping Model, Description, Qty, Unit, Remarks intact. The new BOQ apply buttons follow the same partial-patch pattern via the existing `onUpdate`. Auto-save behavior on OA is left unchanged.

---

## Files to change

- `src/pages/boqs/DesignReview.tsx` — submit email fallback + small label tweak.
- `src/pages/boqs/BoqEditor.tsx` — add `BoqDesignSuggestionRow` inside `BoqItemsList`, wire `useLatestDesignReview(boqId)`.
- `src/pages/orders/OrderEditor.tsx` — extend `OaDesignSuggestionRow` to also surface approval decision + change note row-wise.

## What stays untouched

- Pricing / totals / charges / currency / discounts.
- All existing OA, BOQ, PI, Cost Sheet, Final BOQ, Verification flows.
- Auto-save behavior (existing triggers only).
- Database schema, RLS, RPC signatures.

## Goal
Make the BOQ "Approved" status visible in both the **on-screen print/preview** and the **downloaded PDF**, and ensure per-item Approval/Rejection/Pending status renders consistently in both. Status already updates automatically via the existing approval-link RPC (`verify_boq_items_with_token`) — no backend changes needed.

## Current state
- DB already tracks overall `boqs.verification_status` and per-item `approval_status` (set by `BoqVerify.tsx` → `verify_boq_items_with_token`).
- **PDF (`src/lib/boq/pdf.ts`)** already has a per-item "Approved by Design" column, but **no overall "Approved" badge** in the header.
- **On-screen doc preview (`BoqDocPreview` in `src/pages/boqs/BoqEditor.tsx`)** has neither the overall badge nor the per-item status column — so Print View (which uses this preview via `print:` classes) shows nothing about approval.

## Changes

### 1. `src/lib/boq/pdf.ts` — add overall status badge
- Accept overall status from `boq.verification_status` (no signature change needed; `BoqRecord` already has the field).
- After drawing the BOQ title bar, if `verification_status === "approved"`, draw a small pill on the right edge of the title bar reading **"APPROVED"** in green (`[22,128,51]`). For `pending_verification` show muted **"PENDING APPROVAL"**, for `rejected` show red **"CHANGES REQUESTED"**. Use `doc.roundedRect` + centered text so layout stays inside existing margins.
- Keep the existing per-item "Approved by Design" column unchanged.

### 2. `src/pages/boqs/BoqEditor.tsx` — mirror in `BoqDocPreview`
- Add the same status pill inside the BOQ title bar (top-right) using inline styles, gated on `rec.verification_status`. Colors match the PDF.
- Extend the preview's items `<colgroup>`, `<thead>`, and `<tbody>` to include a 7th column **"Approved by Design"** with the same 24mm width and color rules as the PDF (`Approved` green, `Rejected` red, `Pending` amber). This makes the on-screen preview and the printed page match the PDF 1:1.
- No change to header, meta block, terms, notes, or any non-approval styling.

### 3. No other changes
- No DB / RPC / RLS / auth changes — overall status and per-item statuses are already written by the existing approval-link flow.
- No change to revision creation, BOQ↔OA sync, pricing, totals, save flow, design-comments rows, history, or the `verify_boq_items_with_token` RPC.
- No format/layout change beyond adding the one badge in the title bar and the one extra approval column already present in the PDF.

## Verification
1. Approve a BOQ through the approval link → reopen the BOQ editor: header shows the existing green "Approved" indicator (unchanged), and the live preview's title bar now shows the green **APPROVED** pill; each row shows **Approved / Rejected / Pending** in the new column.
2. Click **Print View** → printed page shows the same pill and per-item column.
3. Click **Download PDF** → generated PDF shows the same pill in the title bar and the existing per-item "Approved by Design" column, with no other layout changes.
4. Repeat for a BOQ still in `pending_verification` and one in `rejected` — pill text and color match.
5. Confirm OA editor, BOQ revise/auto-revise from OA, design-comments rows, change history, and PDF history tab behave exactly as before.

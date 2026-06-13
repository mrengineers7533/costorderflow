
# Optional Motor Details on BOQ (with Hide toggle)

Add an optional **Motor / Motor Qty** display on BOQ surfaces, sourced from the OA line item (already propagated). Add a per‑BOQ toggle so the creator or approver can hide them before final approval. Nothing in OA/PI/Quotation PDFs, calculations, approval flow, or pricing changes.

## Scope

Per the updated spec, BOQ surfaces show **only Motor and Motor Qty** (Motor Price is treated as internal and stays off the BOQ table / PDF / approval page). Motor Price continues to live on the OA line item and BOQ JSON; it is just not rendered on BOQ outputs.

## Data

Add a single new flag on `boqs`:

- `show_motor boolean not null default true`

Approval-link RPC `get_boq_by_verification_token` and the verifier RPC must round‑trip this flag so the approver can read/change it before submitting decisions.

No change to `cost_sheets`, `orders`, BOQ line‑item JSON, or any other schema.

## Behaviour

- **Default**: `show_motor = true` on every new BOQ (legacy rows default to true via column default, so they keep current behaviour where the columns auto‑show when motor data is present).
- **Auto‑hide rule kept**: even when `show_motor = true`, the columns still only render if at least one row actually has motor data — so BOQs without any motor data look identical to today.
- When `show_motor = false`, Motor / Motor Qty are hidden in **BOQ editor table, BOQ PDF, BOQ Excel, distribution link page, and approval page**.
- Approver can flip the toggle on the approval page **before submitting decisions**; the value is persisted on submit so the approved BOQ + its PDF respect the final choice.

## UI changes

### 1. `src/pages/boqs/BoqEditor.tsx`
- New `showMotor` state, hydrated from `boqs.show_motor`.
- Small **"Show Motor Details"** switch in the existing column‑visibility area (next to the Make toggle), only enabled when any row has motor data; tooltip otherwise.
- Save path writes `show_motor` to DB.
- Passes `showMotor` into `generateBoqPDF(...)` and into the BOQ item table render so the two Motor columns hide together.

### 2. `src/components/boqs/DistributeBoqDialog.tsx` (link generation)
- Add the same "Show Motor Details" switch above the "Generate link" button.
- The flag is persisted on the BOQ row before the verification token is issued, so the link the approver opens reflects the creator's choice.

### 3. `src/pages/boqs/BoqVerify.tsx` (approval page)
- Read `show_motor` from the RPC payload.
- Render Motor / Motor Qty in each item card **only when** `show_motor && row has motor data`.
- Add an editable **"Show Motor Details in BOQ"** switch near the verifier‑email field with helper text: "Toggle off to hide Motor & Motor Qty from the approved BOQ and its PDF."
- Pass the final value as a new `_show_motor` argument to `verify_boq_items_with_token`, which persists it on submit.

### 4. PDF — `src/lib/boq/pdf.ts`
- `BoqPdfOptions` gains `showMotor?: boolean` (default `true` to preserve current rendering for callers that don't pass it).
- Effective rule: render Motor & Motor Qty columns only when `showMotor && hasMotorData`. **Motor Price column is removed** from the BOQ PDF in line with the updated spec.
- All existing call sites pass `boq.show_motor ?? true`.

### 5. Excel — `src/lib/boq/excel.ts`
- Same `showMotor` option, same rule. Removes the MOTOR PRICE column from the workbook to match the PDF.

## Backend

- Migration: `alter table public.boqs add column show_motor boolean not null default true;`
- Update `get_boq_by_verification_token` to include `show_motor` in its JSON response.
- Update `verify_boq_items_with_token(_token, _verifier_email, _items, _show_motor boolean default null)` to persist `show_motor` when provided. Existing callers keep working because the new argument is optional.

## What stays untouched

- OA PDF (`src/lib/orders/pdf.ts`), OA Excel, OA item editor (motor fields stay editable as today)
- PI PDF / Quotation PDF / PO PDF / GRN
- `calc.ts`, totals, pricing, EXW Murthal/Turkey, advance, GST
- Item selection, splitting by MR/GMS, revision/audit/approval flows
- `cost_sheets` schema, RLS, storage bucket, rate limiting
- BOQ line‑item JSON shape (motor fields keep flowing through Auto‑BOQ)

## Verification after build

1. Existing BOQ without motor data → PDF unchanged.
2. BOQ with motor data, toggle ON → Motor + Motor Qty appear in editor, PDF, Excel, distribution page, approval page.
3. Toggle OFF in editor → both columns disappear everywhere; saved value survives reload.
4. Approver flips toggle OFF on approval page → approved BOQ and its PDF render without Motor columns; OA editor still shows them.
5. OA PDF, PI PDF, totals, and approval flow unchanged across all cases.

## Goal
Make the GMS bank account details editable in the OA and PI editors, and have those edits flow through the GMS Print Preview, GMS PDF, and Client Copy PDF. No other behavior, layout, calculation, or PDF format changes.

## Current state
- A `Bank Details` editable card already exists in `OrderEditor.tsx`, but it is rendered **inside the `format === "MR"` block only**. GMS has no editable bank UI.
- `OrderPreview` has a `GMSHeadOfficeBank` component that uses `DEFAULT_GMS_BANK` directly (ignores any prop).
- `renderGmsFooter` in `src/lib/orders/pdf.ts` already supports `opts.bank` and falls back to `DEFAULT_GMS_BANK`, but callers never pass a GMS bank.
- `PiEditor.tsx` passes `bank={pi.format === "MR" ? DEFAULT_MR_BANK : undefined}` — no GMS bank state.
- Client Copy PDF in both OA and PI is produced through the same `generateOrderPDF` / `generatePiPDF` path, so feeding the bank into those calls covers Client Copy automatically.

## Changes

### 1. `src/pages/orders/OrderEditor.tsx`
- Add a second piece of state `gmsBank` (default `DEFAULT_GMS_BANK`); keep the existing `bank` (MR) state untouched.
- Render the existing **Bank Details** card for GMS too, bound to `gmsBank` / `setGmsBank`, with "Reset to default" → `DEFAULT_GMS_BANK`. Field labels and layout identical to the MR card.
- When calling `generateOrderPDF` (regular PDF + Client Copy PDF saves) and when passing `bank` to `<OrderPreview>`, choose `format === "GMS" ? gmsBank : bank`.

### 2. `src/pages/pi/PiEditor.tsx`
- Add `gmsBank` state initialised from `DEFAULT_GMS_BANK` (load from existing PI record if a stored override exists; otherwise default).
- Add the same editable Bank Details card to the PI editor for GMS (mirroring the MR layout already used in OA editor).
- Pass `bank={pi.format === "MR" ? DEFAULT_MR_BANK : gmsBank}` into the preview and into `generatePiPDF` for both the regular PI PDF and the Client Copy PDF.

### 3. `src/components/orders/OrderPreview.tsx`
- `GMSHeadOfficeBank` accepts an optional `bank?: BankDetails` prop and uses it when provided, else falls back to `DEFAULT_GMS_BANK`.
- Plumb the `bank` prop into the three call sites of `GMSHeadOfficeBank` so the on-screen Print Preview reflects user edits.

### 4. `src/lib/orders/pdf.ts`
- No code change required (already honors `opts.bank` in `renderGmsFooter`); just ensure callers now pass it.

### 5. `src/lib/pi/pdf.ts`
- No structural change; the existing `opts?.bank` is already forwarded into `generateOrderPDF`, so the new GMS bank from `PiEditor` will flow through.

## Out of scope
- No DB schema changes; bank overrides remain editor-session state (matching how MR currently works). If persistence is desired later it can be added separately.
- No changes to MR flow, calculations, charges, totals, PDF layout, column visibility, or any other module.

## Verification
- OA editor (GMS): edit bank fields → Print Preview footer and downloaded GMS PDF show the edited values; Client Copy PDF shows them too. MR flow unchanged.
- PI editor (GMS): same checks for PI PDF + Client Copy PDF.
- Reset button restores `DEFAULT_GMS_BANK`.
- MR OA/PI bank behavior identical to today.

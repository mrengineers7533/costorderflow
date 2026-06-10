Remove Req No. and Project Number from PO PDF output while keeping them in the backend for traceability and reporting.

## Current State
- `reqLine` (derived from requisition numbers) is passed into `generatePoPDF` and rendered as "REQ / PROJECT" in the K.D template PDF.
- It also appears in the on-screen PO preview on `PoCreateFromAnnexure`.
- Backend fields (`requisition_ids`, `lot_numbers`, `annexure_ids` on `purchase_orders`) are untouched.

## Changes

### 1. PDF generator (`src/lib/purchase/poPdf.ts`)
- Remove `reqLine?: string` from `PoPdfContext` interface.
- Remove the "REQ / PROJECT" column header and value rendering in the vendor-details block of `generatePoPDF`.
- Keep the middle column in the 3-col block but only render `Supplier's Ref`, `Dispatch through`, and `Destination` there.

### 2. PO creation from annexure (`src/pages/purchase/PoCreateFromAnnexure.tsx`)
- Remove `reqLine` from `buildCtx()` call.
- Remove the "REQ No / Project" `<Input>` field from the Vendor & header section.
- Remove the "REQ / PROJECT" block from the on-screen PO preview.
- Keep the `reqLine` state and the requisition-fetch logic internally if useful for debugging/tracking, but do not surface it to the PDF context or preview.

### 3. Existing purchase material page (`src/pages/purchase/PurchaseMaterial.tsx`)
- Remove `reqLine: Array.from(reqSet).slice(0, 2).join(", ") || undefined` from the `generatePoPDF` call.

### 4. PO Folder (`src/pages/purchase/PoFolder.tsx`)
- No change needed; `buildPdf` already does not pass `reqLine`.

### 5. Edge function (`supabase/functions/send-po/index.ts`)
- No change needed; the email PDF builder does not render req/project info.

### 6. Database
- No schema changes. `requisition_ids` on `purchase_orders` remains for backend traceability.

## Acceptance
- PO PDF downloaded from `PoCreateFromAnnexure` and `PurchaseMaterial` does not contain a "REQ / PROJECT" section.
- On-screen preview in `PoCreateFromAnnexure` does not show "REQ / PROJECT".
- Backend tracking fields remain intact.
- No other purchase, annexure, or ES flows are affected.
# Plan: Show Make consistently across BOQ / Requisition / Purchase / Manufacturing

## Problem

Make column already exists on every surface, but most rows render `—`. Reason: BOQ items in the database were created **before** the OA→BOQ `make` propagation patch, so `boq.line_items[*].make` is empty. New OAs/BOQs work; legacy ones don't. The user wants Make to surface consistently for ALL rows, sourced from OA when the BOQ field is blank — without changing layouts, calculations, or workflows.

## Approach

Resolve Make at **read-time** with an OA fallback (no DB migration, no write paths touched). For each rendered BOQ item, if `item.make` is non-empty use it; otherwise look up the linked OA revision's matching line item (by `id` → `model_number`+`description` → row index) and use its `make_label`. This is purely a display-layer resolver.

## Changes

### 1. New helper — `src/lib/boq/makeResolver.ts`
- `buildMakeResolver(orderLineItems)` returns `(boqItem, index) => string`
- Match priority: `boqItem.make` (trim) → OA item with same trimmed lowercase `description`+`model_number`/`hsn_code` → OA item at same index → `""`.
- Pure function, no side effects.

### 2. `src/pages/modules/ApprovedBoqModule.tsx` (Purchase + Manufacturing detail)
- After loading the BOQ, also fetch `orders` row at `boq.source_order_id || boq.order_id`.
- Build resolver from `order.line_items`.
- Render `{resolveMake(it, idx) || "—"}` in the Make `<td>`.
- No layout/toggle/colSpan changes.

### 3. `src/pages/requisitions/RequisitionDetail.tsx`
- After loading `boq`, also fetch its source OA and build the resolver.
- For the Items tab and Steel/Outside tables, prefer `(it.fg_snapshot as {make?:string}).make` then fall back to `resolveMake(matchingBoqItem, idx)` (match by `boq_item_id` against `boq.line_items`).

### 4. `src/pages/requisitions/PublicRequisition.tsx`
- Same OA fetch + resolver wiring for the FG items render path (raw materials Make tab unchanged — that's a separate field).

### 5. `src/components/manufacturing/CreateRequisitionDialog.tsx`
- Add a hidden-by-default Make column (toggle via `useColumnToggle("req.create.columns.make", false)`) in the select table.
- Resolve via the same helper using the parent OA fetched once on dialog open.
- Bump `colSpan` from 6 → 7 when toggle is on. No selection logic changes.

## Out of scope
- No DB migrations / backfills, no RLS, no edge functions.
- No changes to BOQ/PI/Requisition PDFs (already have toggleable Make).
- No changes to OA editor, revisions, calculations, approvals, notifications.
- Default visibility remains hidden everywhere — user toggles per surface.

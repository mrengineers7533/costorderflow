## Problem

Design team comments on **Motor**, **Motor Qty**, **Remarks**, and **Model** are saved correctly in the database (the Design page stores them with the right `column_key`), and the OA editor already looks them up correctly via `cellComment(it.id, "motor")`, `"motor_quantity"`, `"remarks"`, `"model_number"`.

The reason they don't appear on OA: those `<OaCellDesignComment>` renders are wrapped in `{showItemExtras && (...)}` (OrderEditor.tsx lines 1178–1217). `showItemExtras` defaults to **false**, so the entire Model / Motor / Motor Qty / Remarks columns — and their attached Design comments — stay hidden until the user clicks "Show Model, Motor, Remarks & Approval".

Description / Qty / Unit comments are visible because those columns are always rendered.

## Fix (OA display only — `src/pages/orders/OrderEditor.tsx`)

Make sure Design comments on the four "extras" fields always reach the OA, without changing OA's default column layout, calculations, PDF, or any other behaviour.

Smallest, safest change:

1. **Auto-open the extras columns when a Design comment exists for any extras field on the current BOQ.** Add a small `useEffect` after `designCellComments` is loaded: if any comment has `column_key` ∈ `{ "model_number", "motor", "motor_quantity", "remarks" }` and `showItemExtras === false`, call `setShowItemExtras(true)` once. This re-uses the exact same comment-display feature/format the user already knows, keeps "Apply" mapping intact, and only affects the OA editor view — no PDF/totals/state changes.

2. **Belt-and-braces fallback** (covers users who manually hide extras again): when `!showItemExtras`, render a compact, read-only list of any Design comments for `model_number / motor / motor_quantity / remarks` underneath each row's description, using `<OaCellDesignComment canApply={false} ... />` prefixed with the field label (e.g. "Motor:", "Remarks:"). When extras are visible, this fallback list is suppressed so comments don't duplicate.

Nothing else is changed. No edits to:
- `boq_design_comments` schema, RPC, or RLS
- Design page save logic (column_key values already match)
- OA calculations, totals, PDF/print, Excel export
- Approval / unapprove / notification / revision logic
- Manufacturing / Purchase / OA Creator behaviour

## Files touched

- `src/pages/orders/OrderEditor.tsx` — one `useEffect` to auto-enable extras when relevant comments exist, plus a fallback render block under each item row when extras are hidden.

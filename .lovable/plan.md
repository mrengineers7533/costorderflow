## Goal

Make the Design Comments block under each OA item look and behave exactly like the BOQ screenshot you shared: a single dashed-orange band per row with `DESIGN COMMENTS · R{n} · {reviewer}`, inline `Apply {Col} → OA` buttons, and an always-visible value grid (MODEL / DESCRIPTION / QTY / UNIT / REMARKS). Applies to MR and GMS. Linking, calculations, pricing, PI, PDF, BOQ verification flow — all untouched.

## What stays the same

- BOQ design row (already matches the screenshot) — no changes.
- BOQ revisioning on OA save — already wired through `syncBoqsAndPisForOrder` + `createPendingBoqRevision`, no logic change needed. Re-confirmed: applying a value in OA → marking OA dirty → save (auto or manual) → BOQ family in-place syncs (description/qty/unit/remarks) and a pending BOQ revision is created when OA revision bumps. Works for both MR and GMS.
- All matching is by `boq_item_id` first, then normalized description, then positional index — comments stay glued to the correct row.

## OA `OaDesignSuggestionRow` changes (single file: `src/pages/orders/OrderEditor.tsx`)

1. Visual layout to mirror the screenshot exactly:
   - Header line: `DESIGN COMMENTS · R{round_no} · {reviewer_name?}` in uppercase orange, followed inline by one `Apply {Label} → OA` button per non-empty column (Model, Description, Qty, Unit, Remarks).
   - Always-visible value grid below (drop the "View history" toggle), one tile per present column showing label + value, matching the BOQ block's style.
   - Keep approval pill (Approved / Change Required / Pending) and `Change note:` line when the latest round is an approval round.

2. Apply targets all route to OA (Model → `model`, Description → `description`, Qty → `quantity`, Unit → `unit`, Remarks → `remarks`) via the existing `updateItemById` patch — preserves all other fields on the row.

3. After any Apply, keep calling `onAutoSave` (debounced 500 ms `save(false)`), which:
   - persists the OA,
   - triggers `syncBoqsAndPisForOrder` → BOQ rows update in place,
   - and `createPendingBoqRevision` runs when OA `revision` bumps, producing a fresh BOQ revision automatically.

4. Remove the BOQ-target branch / `applyDesignToBoq` button paths from this row (BOQ side already has its own row-wise Apply → BOQ block in `BoqEditor`). Keep the `applyDesignToBoq` helper itself in the file (still imported elsewhere) but stop calling it from the OA inline buttons; OA → BOQ propagation now flows exclusively through the standard OA save → sync pipeline, which is the documented behavior the user is asking for.

5. No prop changes that break callers other than this component's own interface; the call site at line 1040 simplifies (drop `boqLinked`, `onApplyToBoq`).

## Files to change

- `src/pages/orders/OrderEditor.tsx` — rewrite `OaDesignSuggestionRow` and update its single call site.

## Untouched

- `src/pages/boqs/BoqEditor.tsx`, `src/pages/boqs/DesignReview.tsx`, all of `src/lib/revisions/*`, `src/lib/orders/calc.ts`, RPCs, RLS, schema, all pricing/charges/totals/PI/PDF/Excel/Final BOQ/Verification paths.

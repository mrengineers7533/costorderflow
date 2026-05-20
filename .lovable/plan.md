## Goal

Make the per-cell **Apply Model** and **Apply Remarks** buttons in the OA design-suggestion strip write to the new OA Model/Remarks columns (not directly to the BOQ), then auto-save the OA. The existing OA-save pipeline already auto-syncs the linked BOQ and the existing "Revise" button already bumps OA `R5→R6` and creates a matching BOQ `R6` — so the only fix needed for revision-number behaviour is making sure OA Model/Remarks actually flow into the BOQ during sync/revise.

## Changes

### 1. `src/pages/orders/OrderEditor.tsx` — Apply Model/Remarks targets OA + auto-save

- In the `OaDesignSuggestionRow` component (~lines 1970–2069):
  - Change the `tiles` config so **Model** and **Remarks** also have `target: "oa"` (apply into the OA row, not BOQ).
  - In `applyCell`, when `t.key === "model"` → `onApply({ model: v })`; when `t.key === "remarks"` → `onApply({ remarks: v })`. Remove the BOQ branch for these two cells.
  - After every successful `onApply(...)` call in `applyCell`, fire a new `onAutoSave()` callback (passed in as a prop).
  - Button labels become "Apply Model → OA" / "Apply Remarks → OA" and use the same `canApply` gate as other OA cells. Keep history panel as-is (also routed through `applyCell`, so auto-save fires there too).
  - Keep the `onApplyToBoq` prop and code paths intact (still passed in) so nothing else breaks; it just no longer wires up to Model/Remarks tiles. (We can remove it later; for now leave the prop optional to minimise blast radius.)
- In the parent OA editor (around line 967 where `<OaDesignSuggestionRow ... />` is rendered):
  - Pass `onAutoSave={debouncedAutoSave}` where `debouncedAutoSave` is a tiny `useRef`-debounced wrapper (≈500 ms) around the existing `save(false)` function. Skip auto-save when `!isCurrent || !canApply` to preserve the current read-only-revision guard.
  - No change to the existing `applyDesignToBoq` function — left in place but no longer triggered by the strip.

### 2. `src/lib/revisions/index.ts` — propagate OA Model/Remarks into BOQ

`syncBoqsAndPisForOrder` (lines 273–296) and `reviseBoqFromOrder` (lines 172–187) currently take `model_number` from `it.hsn_code` only and **always** take `remarks` from the previous BOQ row. Adjust the per-item mapping in **both** places:

```text
model_number = (it.model && it.model.trim()) || it.hsn_code || prev?.model_number || ""
remarks      = (it.remarks && it.remarks.trim()) || prev?.remarks || ""
```

This is the only way the new OA Model/Remarks values can reach the BOQ on save (sync) and on revise (R6 BOQ).
- For `syncBoqsAndPisForOrder` the `prevByModel` lookup keeps working because the model value still resolves to the same effective string.
- For `reviseBoqFromOrder`, the description+model key continues to match because the new OA `it.model` is what was just applied — first sync after Apply may not find a `prev`, which is fine (falls through to OA values).

No change to calculations, totals, OA/BOQ/PI save shape, PDF/Excel, design-review writes, audit logs, revision-numbering RPCs, or the `reviseOrder` flow itself. The existing "Revise OA" button already produces `MROA/.../R{n+1}` and a matching `MRBOQ/.../R{n+1}` — verified at `OrderEditor.tsx:599` (`reviseOrder(..., { autoReviseBoq: true })`) and `revisions/index.ts:153` (`nextRev = orderRev.revision`).

### Out of scope
- No DB migration, no schema/RLS/edge changes.
- No change to `applyDesignToBoq` semantics, BOQ Pending Changes panel, design review tables, PDF "Approved by Design" column, or PI flow.
- No change to OA revision numbering — already correct.

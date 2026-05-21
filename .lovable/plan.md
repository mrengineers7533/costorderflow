## Root cause

On the main OA page, the inline `OaDesignSuggestionRow` is already wired under every line item, but it only renders when `designReview` resolves — and `designReview` depends on `currentBoq`. The current BOQ lookup is broken for OAs where the BOQ is linked to the **root** order (the common case for first revisions):

`src/pages/orders/OrderEditor.tsx` (lines 150–160):

```ts
const { data: family } = await supabase
  .from("orders").select("id").eq("parent_order_id", parentOrderId);
const ids = (family || []).map((r) => r.id);
if (!ids.length) { setCurrentBoq(null); return; }
const { data } = await supabase.from("boqs")
  .select("*").in("order_id", ids).eq("is_current", true).maybeSingle();
```

`parentOrderId` is set to `o.parent_order_id || o.id` (the root). The query only fetches **child** revisions and excludes the root itself, so any BOQ that lives on the root order is never matched → `currentBoq` is `null` → `useLatestDesignReview` is called with `null` → no design comments row renders on OA. BOQ keeps showing the comments because the BOQ page queries its own id directly.

This explains exactly what the user reports: comments show in BOQ with Apply/Save, but not row-wise on OA.

## Fix (single, surgical change)

Include the root order's own id in the family list when looking up `currentBoq`:

```ts
const { data: family } = await supabase
  .from("orders").select("id")
  .or(`id.eq.${parentOrderId},parent_order_id.eq.${parentOrderId}`);
```

Everything else (`OaDesignSuggestionRow`, `findReviewItemForOaItem`, the apply-and-auto-save flow, and `syncBoqsAndPisForOrder` which auto-revises the BOQ) is already in place from prior turns and meets the rest of the requirements:

- Row-wise tiles under every visible OA item (MR and GMS, in `ALL`/`MR`/`GMS` split views).
- `Apply {Col} → OA` buttons patch the OA item and call `scheduleAutoSave`, which persists the OA, creates the OA revision (`… R1`), then runs `syncBoqsAndPisForOrder` to auto-create the matching BOQ revision (`…R1`).
- Comments stay linked to the correct row via id → normalized description → positional fallback.
- No pricing/calc/business-logic change.

## Files to edit

- `src/pages/orders/OrderEditor.tsx` — update the `useEffect` at line 151 only.

## Verification

1. Open OA `2026-27/GMS/0004` (linked BOQ `26-27/GMSBOQ/0004` with a submitted design review) → the dashed primary-tinted `Design Comments · R{n}` block now appears under each item with `Apply Model/Description/Qty/Unit/Remarks → OA` buttons.
2. Click an Apply → OA value updates, auto-save fires → OA bumps to `2026-27/GMS/0004 R1` and BOQ bumps to `26-27/GMSBOQ/0004R1` (visible in revisions panel).
3. Repeat on an MR OA → same behavior.
4. In split-mode orders toggle `ALL` / `MR` / `GMS` → block stays under each visible item.

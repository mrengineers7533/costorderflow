## Status

This was implemented in the previous turn. `OaDesignSuggestionRow` already renders inline under every OA line item in `src/pages/orders/OrderEditor.tsx` (call site at the item loop, lines ~1040). It is format-agnostic — each OA has a single format (MR or GMS), so the same component renders for both MR and GMS orders, and stays visible in split-mode views (`ALL` / `MR` / `GMS`) because the inline block is rendered per visible item.

What's shown per row (matches BOQ behavior):
- `DESIGN COMMENTS · R{n} · {reviewer}` header
- Inline `Apply {Col} → OA` buttons (Model / Description / Qty / Unit / Remarks) for every non-empty column comment
- Always-visible value tiles grid below
- Approval decision pill (Approved / Change Required / Pending) and `Change note:` when the latest round is an approval round
- Comments stay glued to the correct row via `findReviewItemForOaItem` (id → normalized description → positional fallback)

## Preconditions for the inline block to appear

- The OA must have a linked BOQ (`currentBoq` resolves the current-is_current BOQ in the OA family). New unsaved OAs won't show comments until they are saved at least once and a BOQ row exists.
- The BOQ must have at least one submitted design review round (`fetchLatestSubmittedRound`). Until Design submits, nothing renders.

These preconditions are identical to the BOQ editor's behavior.

## Plan

No code changes proposed. To confirm:

1. Open an MR OA whose linked BOQ already has a submitted design review → confirm the inline block renders under each item with comments.
2. Same for a GMS OA → confirm identical block renders.
3. In split-mode orders, toggle MR / GMS / ALL views → confirm the inline block stays under each visible item.

If anything is missing in your test (e.g. the block doesn't render for one of the makes), share the specific OA number/route and I'll diagnose — most likely cause is "no submitted design review on that BOQ yet" rather than a code gap.

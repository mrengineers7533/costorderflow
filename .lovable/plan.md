## Goal

Stop showing the "DESIGN SUGGESTED UPDATE" block inside the BOQ items list. Instead, surface those design-team comments **item-wise under the matching row in the Main OA editor** so the OA creator can update the OA directly. No calculation/feature changes anywhere.

## Changes

### 1. `src/pages/boqs/BoqEditor.tsx` — remove inline design suggestions in BOQ
- In `BoqItemsList`, stop calling `useLatestDesignReview` and stop rendering `<DesignSuggestionInlineRow>` under each BOQ row.
- Delete the now-unused `DesignSuggestionInlineRow` component and the `useLatestDesignReview` / `parseColumnComments` / `ColKey` imports from this file.
- Keep everything else (Pending status badge, Remarks editing, Revision History, Pending Changes panel, Design Review Panel side card) untouched. The design comments still exist in DB — only the BOQ-items inline rendering is removed.

### 2. `src/pages/orders/OrderEditor.tsx` — show comments under matching OA row
- The OA editor already loads `currentBoq` (the linked BOQ for this OA family). Reuse it.
- When `currentBoq?.id` is set, call `useLatestDesignReview(currentBoq.id)` to fetch the latest submitted design-review round + its items.
- Build a lookup keyed by **normalized description** (lowercase + collapsed whitespace) of `review.items[i].description` → review item. Description match is reliable because BOQ items are generated 1:1 from OA `line_items` by description (see `BoqEditor.tsx` lines 146–154). Fallback to positional index match if description is empty/duplicated.
- For each row in the OA items table (the `editorItems.map` block around lines 851–869), render a sibling block underneath when a matching review item with non-empty `column_comments` (or legacy parsed comment) exists. Use the same visual treatment as the current BOQ block (orange-tinted dashed border, "DESIGN SUGGESTED UPDATE · R{n} · {reviewer}" label).
- Per-column tiles shown: Description, Qty, Unit. (Model & Remarks have no OA counterpart — render as read-only info tiles, no Apply button.) Each tile shows the suggested value + an **Apply** link that calls `updateItemById(it.id, { description / quantity / unit })`. Apply buttons are only enabled when the OA row is editable (i.e. not a superseded read-only revision — reuse the same gate that controls the existing inputs).
- Quantity Apply parses `Number(v) || it.quantity`.
- The block is purely a UI overlay: no changes to `items` state shape, totals, charges, save payload, PDF/Excel generation, BOQ generation, PI flow, or any calculations.

### 3. Shared helper
- Extract a small helper `findReviewItemForOaItem(reviewItems, oaItem, index)` in a new file `src/lib/orders/designComments.ts` so both the lookup and the column parsing (`parseColumnComments` from `@/lib/boq/designReview`) are isolated and testable. No DB or schema changes.

### Out of scope
- No DB migration, no RLS change, no edge function change.
- No change to `DesignReviewPanel`, `PendingChangesPanel`, BOQ revisions, BOQ PDF/Excel, PI flow, Client Copy, or any calculation/formula.
- No change to how Design Team submits comments — only where they are displayed.

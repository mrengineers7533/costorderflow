## Problem

BOQ item rows display in lexicographic order of `item_no` (a text column), so the sequence shows `1, 10, 11, 12, …, 2, 20, …` instead of true numeric order. Root cause: items are fetched/sorted as strings, e.g. `src/lib/boq/designReview.ts:138` does `.order("item_no", { ascending: true })`, and several render sites iterate the list as-is without numeric sorting.

## Fix (display/sort only — no data, calc, OA, or workflow changes)

Add a single helper and apply it everywhere items are listed.

1. **New helper** in `src/lib/boq/types.ts` (or a small utility next to it):
   ```ts
   export function sortByItemNo<T extends { item_no?: string | number | null }>(items: T[]): T[] {
     const toNum = (v: unknown) => {
       const n = parseInt(String(v ?? "").trim(), 10);
       return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
     };
     return [...items].sort((a, b) => toNum(a.item_no) - toNum(b.item_no));
   }
   ```
   Non-numeric / blank `item_no` values sink to the end, preserving insertion order via stable sort.

2. **`src/lib/boq/designReview.ts`** — in `fetchReviewItems`, drop `.order("item_no", ...)` (text sort) and instead sort the returned rows numerically with `sortByItemNo` before returning. This fixes the Design Comment link and Design Approval link tables.

3. **Apply `sortByItemNo` at the render sites that iterate items** (read-only sort of a local copy; never mutates state or DB):
   - `src/pages/boqs/BoqEditor.tsx` — the preview/print table (line ~609) and the editor list view (line ~495). For the editable list, sort a derived array for rendering only; keep the underlying `items` state untouched so existing add/remove/auto-renumber on save logic is unchanged.
   - `src/pages/boqs/FinalBoq.tsx` — items map at line ~82.
   - `src/pages/boqs/BoqVerify.tsx` — items list at line ~147.
   - `src/pages/boqs/DesignReview.tsx` — `items.map` in the table body.
   - `src/components/boqs/DesignReviewPanel.tsx` — round items table at line ~272.
   - `src/components/boqs/RevisionsTable.tsx` — items map at line ~103.
   - `src/components/boqs/BoqCompareDialog.tsx` — both side-by-side item lists (lines ~162, ~195).

4. **PDF/Excel exports** (`src/lib/boq/pdf.ts`, `src/lib/boq/excel.ts`) — sort the items array with `sortByItemNo` before building rows, so printed/downloaded BOQ matches the on-screen order.

## Out of scope

- No DB schema changes, no migration, no edits to `item_no` storage type.
- No changes to auto-renumber logic in `BoqEditor.save`, OA sync, calculations, RPCs, or permissions.
- No reordering of any other columns or unrelated lists.

## Verification

- Open a BOQ with items numbered 1–20 → list shows 1,2,3,…,20 in BOQ editor, Design Comment link, Design Approval link, Revision History snapshot, Final BOQ page, Verify page, Compare dialog, and exported PDF/Excel.
- Add a new item (becomes "21" on save) → still sorts correctly.
- Blank/non-numeric `item_no` (legacy data) appears at the bottom without crashing.

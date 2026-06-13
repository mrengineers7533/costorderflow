## Goal

Show **Motor** and **Motor Qty** columns (read-only) wherever BOQ items are listed inside the Design Review flow:

1. **OA-side Design Review panel** (`DesignReviewPanel.tsx`)
   - "Prepare items for Design" table
   - Submitted/in-flight review items table (shows designer's comments/decisions)
2. **Designer-facing review link page** (`src/pages/boqs/DesignReview.tsx`)
   - Items table the designer sees and comments on
   - Previous-round diff row (so motor changes are tracked)

Columns are inserted between **Unit** and **Remarks** (mirrors BOQ layout where Motor sits before Qty/Unit/Remarks — here Qty/Unit come first in design-review tables, so Motor goes after Unit, before Remarks). Both columns render whenever the parent BOQ's `show_motor` flag is on (default true). Per-column comments are not added for Motor (designer can comment in Remarks/Change Note as today).

Out of scope: pricing, OA/PI/Quotation/PO PDFs, approval logic, per-column comment schema, BOQ PDF (already done in prior turn).

## Changes

### 1. Database — snapshot motor on the design-review items row
**Migration** on `boq_design_review_items`:
- Add `motor text` (nullable)
- Add `motor_quantity numeric` (nullable)

No GRANT or RLS changes needed (table already configured). No backfill — existing rounds simply render empty Motor cells.

### 2. `src/lib/boq/designReview.ts`
- `DesignReviewItemRow` type: add `motor?: string | null; motor_quantity?: number | null`.
- `createDesignReview` insert (≈ line 138): include `motor: it.motor ?? null, motor_quantity: it.motor_quantity ?? null` when persisting items.
- Any other place that builds `DesignReviewItemRow` baselines (e.g. `buildChangeLog`, `diffItemsAgainstBaseline`, `fetchLatestApprovalRound`): include the two fields when needed for diffing (only if currently mapping limited columns; otherwise they ride along automatically).

### 3. `src/components/boqs/DesignReviewPanel.tsx`
- "Prepare items for Design" table (≈ lines 273–311):
  - Add `<th>Motor</th><th>Motor Qty</th>` after Unit, before Remarks (gated on `boq.show_motor !== false && anyRowHasMotorData`).
  - Add matching `<td>` cells showing `it.motor` / `it.motor_quantity ?? ""`.
- Submitted review table (≈ lines 443–508):
  - Same two `<th>` + `<td>` cells, same gating using `boq.show_motor` from the BOQ row already loaded by the panel.
  - The "Design" suggestion sub-row (`colMap.map(...)`) keeps its 5 column cells; add 2 empty `<td>` spacers so column alignment is preserved.

### 4. `src/pages/boqs/DesignReview.tsx`
- Fetch `show_motor` flag: extend `meta` / `boq_snapshot` typing to read `show_motor` (already stored implicitly only if we add it). Add `show_motor: boq.show_motor` to the snapshot in `createDesignReview` (step 2). Default true when absent.
- Items table header (≈ line 326): add Motor + Motor Qty `<TableHead>`s after Unit, before Remarks, gated on `showMotor && anyMotorData`.
- Items table body (≈ line 368): add two `<TableCell>` cells showing `it.motor` / `it.motor_quantity ?? ""`.
- Previous-round diff row (≈ line 352): if Motor cell shown, render the previous value strike-through alongside the other diff fields. Extend `DIFF_FIELDS` with `motor` and `motor_quantity` entries so existing diff machinery handles it.
- Comments sub-row (≈ line 394): add two empty `<TableCell>` spacers in the Motor positions to keep column alignment — designer cannot leave per-column comments on Motor (matches scope rule).

### 5. QA
- Open OA → BOQ with motor data → DesignReviewPanel "Prepare" table shows Motor + Motor Qty.
- Generate Comment Link → designer page shows the two columns + previous-round diff if the row's motor changed.
- Submit comments → return to panel → submitted table shows Motor + Motor Qty alongside designer's per-column comments (no Motor comment column).
- BOQ with `show_motor=false` → columns hidden everywhere in design review (matches BOQ rule).
- BOQ with zero motor data on any row → columns hidden (keeps legacy BOQs visually unchanged).
- OA/PI/Quotation PDFs unchanged.

## Technical notes

Files touched: `supabase/migrations/<new>.sql`, `src/lib/boq/designReview.ts`, `src/components/boqs/DesignReviewPanel.tsx`, `src/pages/boqs/DesignReview.tsx`.

No new dependencies, no edge-function changes, no RLS changes.

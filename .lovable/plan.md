## Goal

Show Design comments inline directly beneath each OA line-item cell (Description, Make/Model, Qty, Unit, Motor, Motor Qty, Remarks). Remove the separate "Design Comments on linked BOQ" summary block at the top of the OA editor.

No changes to OA save/revise, BOQ revise, calc, permissions, or notifications — only presentation of existing `boq_design_comments` data plus the existing Apply/Manual actions.

## Frontend changes (only)

### 1. `src/pages/orders/OrderEditor.tsx`
- Remove the top-mounted `<OaDesignCommentsPanel … />` block (lines ~1003–1009).
- Add a single fetch of `boq_design_comments` for `currentBoq.id`, grouped into a `Map<boqItemId, Map<columnKey, DesignCommentRow>>` (latest comment per cell). Refetch when `currentBoq.id` changes.
- Build a BOQ-item → OA-row resolver reusing the existing match logic from `OaDesignCommentsPanel` (id match → normalized description match → positional fallback). Produce `oaIdToBoqItemId` map for the rendered `editorItems`.
- For each rendered row in the Line Items grid, render a small `<OaCellDesignComment />` directly under the relevant cell's `<Input />` (same grid column / col-span as the input) for these fields:
  - Description → `column_key = "description"`
  - Model → `model_number`
  - Qty → `quantity`
  - Unit → `unit`
  - Motor → `motor`
  - Motor Qty → `motor_quantity`
  - Remarks → `remarks`
- Each cell input gets a `data-oa-cell="{rowIndex}:{columnKey}"` attribute so we can still focus on Manual (no behavior change).

### 2. New `src/components/orders/OaCellDesignComment.tsx`
Tiny presentational component, props: `{ comment, currentValue, onApply, onMarkRead? }`.
- If no comment → render nothing.
- Else render a compact one-line note under the input:
  - Icon + "Design:" label + comment text (truncated, tooltip on hover for full text).
  - Author/department/time on a second muted line (xs).
  - Buttons: **Apply** (calls `onApply(value)`), **Manual** (does nothing functionally — just dismisses the highlight). 
  - If `applied_to_oa_at` is set, show muted "Applied <date>" instead of buttons.
- Styling: `text-[11px]`, `border-l-2 border-primary/40 pl-2 mt-1`, no card, no extra height when empty.

### 3. Apply action
Reuse the existing logic from `OaDesignCommentsPanel.applyComment`:
- Coerce `quantity` / `motor_quantity` to number, else string.
- Call `updateItemById(itemId, { [field]: value })`.
- Call existing `apply_design_comment_to_oa` RPC (best-effort, ignore errors) to set audit columns and refresh the local map.
- Toast: "Applied to editor — Save / Revise to publish."

### 4. Files to delete / keep
- Delete `src/components/orders/OaDesignCommentsPanel.tsx` (no other usages).
- Keep `apply_design_comment_to_oa` RPC, DB schema, audit columns, and trigger — unchanged.

## Out of scope

- No DB migration.
- No change to the existing per-cell "+ Comment" UI on `DesignBoqView`.
- No change to Design Status column, notifications, history button, or auto-revise.
- No change to OA save/revise/calc/PDF/permissions.

## Risk notes

- The grid uses `gridTemplateColumns: repeat(... 1fr)`. Inline comments must be placed as siblings inside the same grid row (using matching `col-span`) so they sit directly below their cell. We will wrap each input in a `div` with `col-span-X` containing the input + the optional comment node, instead of placing the comment as a separate grid child, so alignment stays exact regardless of which optional columns are visible.

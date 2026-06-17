# Red + Bold Highlight for Commented Cells

Add visual highlighting (red border + bold red text) to any cell where a Design comment exists. Display-only change — no impact on calculations, save logic, workflow, approvals, notifications, PDF/print, or any other department screen.

## 1. Design page — `src/pages/design/DesignBoqView.tsx`

For each per-cell `<Textarea>` in the items table (Model, Description, Qty, Unit, Motor, Motor Qty, Remarks):

- Compute `hasComment = (drafts[k]?.trim().length > 0) || (otherCommentsByCell[k]?.length > 0)`.
- When `hasComment`:
  - The cell's displayed value above the textarea gets `font-bold text-red-600`.
  - The `<Textarea>` gets `border-red-500 ring-1 ring-red-500/40 font-bold text-red-600`.
- Unchanged cells keep current styling.

No change to save/auto-unapprove/approval logic.

## 2. OA page — `src/pages/orders/OrderEditor.tsx`

For each input that has a corresponding `<OaCellDesignComment>` (Description, Qty, Unit, Model, Motor, Motor Qty, Remarks):

- Check `cellComment(it.id, <columnKey>)`. If present → add classes `border-red-500 ring-1 ring-red-500/40 font-bold text-red-600` to that `<Input>`.
- The existing `<OaCellDesignComment>` continues to render exactly as today (comment text/format unchanged).
- Unchanged cells: no styling change.

Helper inline (no new file):
```ts
const hl = (has: boolean) => has ? "border-red-500 ring-1 ring-red-500/40 font-bold text-red-600" : "";
```
Applied via `className={`${existing} ${hl(!!cellComment(it.id, "motor_quantity"))}`}`.

## Out of scope (untouched)

BOQ calculations, totals, PDF/Excel/print formats, save logic, design_review_status flow, per-item approval logic, auto-unapprove, notifications/acknowledgements, revision/auto-BOQ logic, Manufacturing/Purchase/OA Creator behaviour, schemas, RPCs.

## Files

- `src/pages/design/DesignBoqView.tsx` — add highlight classes in the cell render loop.
- `src/pages/orders/OrderEditor.tsx` — add highlight classes on the 7 Inputs that already pair with `OaCellDesignComment`.

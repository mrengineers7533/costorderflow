## BOQ Column Reorder — On-Screen Table & PDF Only

### New column order
```
Item | Model | Description | Qty | Motor | Motor Qty | Unit | Remarks | Approval
```

(Optional "Make" column, when toggled on, stays in its current spot between Description and Qty — it was not listed by the user so it remains an optional addition controlled by the existing toggle.)

### What changes vs. today
Current order: `Item | Model | Description | [Make] | [Motor] | [Motor Qty] | Qty | Unit | Remarks | [Approval]`
New order:     `Item | Model | Description | [Make] | Qty | Motor | Motor Qty | Unit | Remarks | Approval`

Differences:
- **Qty** moves to immediately after Description/Make (before Motor).
- **Motor** and **Motor Qty** move to after Qty (before Unit).
- Unit, Remarks, Approval order unchanged at the tail.

### Files to change

1. **`src/lib/boq/pdf.ts`** (`generateBoqPDF`)
   - Reorder `headRow` array push order.
   - Reorder the per-row `base[]` push order to match.
   - Reorder `columnStyles` index assignments (keep `cellWidth: "auto"` everywhere — auto-fit stays).
   - Recompute `approvalIdx` based on the new position.

2. **`src/pages/boqs/BoqEditor.tsx`** — `BoqDocPreview` (HTML print preview that drives the Print button & live preview)
   - Reorder `<thead>` header cells to new order.
   - Reorder `<tbody>` row cells to match.
   - Update the index math used to decide which header cells are centered.

### Explicitly NOT changed
- On-screen editor table (`BoqItemsList` and `buildBoqGridColumns`) — user said "apply only BOQ backend data & PDF". The editor UI stays in its current column order.
- No edits to OA, PI, PO, Requisition, distribution link, approver page, Excel export, notifications, calculations, save/revision/approval logic, or the `boqs` schema.
- No new fields. No rename of Model → HSN. No Rate/Amount added.
- "Backend data" in BOQ items JSON has no column order (it's keyed by field name) — nothing to change there. Reorder applies only to how the PDF and HTML print preview render columns.
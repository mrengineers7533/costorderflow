## Changes to Purchase Order flow

### 1. Auto-generate + editable PO Number (sequence continues)
- On entering `PoCreateFromAnnexure`, call new RPC `peek_next_po_number(_fy)` that returns the next PO number **without consuming the counter** (computed as `max(last_number, max suffix from existing purchase_orders for that FY) + 1`, formatted `PO/YY-YY/0001`).
- Show it in a new editable `Input` field (`poNumber` state) defaulting to that value; user may overwrite.
- On submit:
  - Validate format `PO/\d{2}-\d{2}/\d{4}`.
  - Check duplicates: `select id from purchase_orders where po_number = ?` → if exists, error "PO number already exists".
  - If user-edited and equals peeked value → call existing `next_po_number` (advances counter). If user provided a different number → insert with that number and `update po_counters` so `last_number = max(last_number, suffix)` to keep sequence consistent.
- Add DB unique index on `purchase_orders.po_number` if not present (it likely already is — migration will be idempotent).

### 2. Editable PO Date (defaults to today) + Due On (PO-level)
- Add migration adding `po_date date` and `due_on date` columns to `public.purchase_orders` (nullable; backfill `po_date = created_at::date`).
- UI: two `Input type="date"` fields in the header card.
  - `poDate` defaults to today's ISO date.
  - `dueOn` blank by default, optional.
- Persist on insert. Use `poDate` for PDF "DATE" line (replace `new Date(ctx.createdAt)` usage by passing `poDate`).
- `dueOn` shown in PDF header block (e.g. "Due On : dd Mon yyyy") and in PO detail page (`PurchaseDetail.tsx` — add a labeled line).
- Keep existing per-row "Due On" field as-is (separate per-line dates already supported).

### 3. Remove "Category" line from PO PDF
- In `src/lib/purchase/poPdf.ts`, delete the `doc.text(\`Category : ${catLabel[ctx.category]}\`, M, 27)` line and shift the starting `y` accordingly.
- In `supabase/functions/send-po/index.ts`, remove the `drawText(\`Category : ${po.category}\`, M, y)` block + its `y -= 16`.
- Category still stored in DB; only hidden from PDF.

### 4. Files touched
- `supabase/migrations/<new>.sql` — add `po_date`, `due_on` columns + `peek_next_po_number` RPC + bump-counter helper.
- `src/pages/purchase/PoCreateFromAnnexure.tsx` — new state (`poNumber`, `poDate`, `dueOn`), UI inputs, peek RPC call, duplicate check, conditional counter advance, pass `poDate`/`dueOn` to `buildCtx` and insert.
- `src/lib/purchase/poPdf.ts` — remove Category line; render `poDate` and optional `Due On`; extend `PoPdfContext` with `poDate?` and `dueOn?`.
- `src/pages/purchase/PurchaseDetail.tsx` — display `po_date` and `due_on`.
- `supabase/functions/send-po/index.ts` — remove Category line; use `po.po_date` for date; show `due_on`.

### 5. Out of scope
- No change to row-level Due On, PO editing after creation, send/email flow logic, or any other PO behaviour.
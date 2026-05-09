## Goal
Extend the Client Copy feature with (1) duplicate item consolidation, (2) persistent storage of generated Client Copy PDFs against the OA, and (3) a unified Version History section showing every OA revision and every saved Client Copy with View / Print / Download PDF / Download Excel actions.

Original OA, BOQ, PI, calculation, draft, and finalization flows remain untouched. All Client Copy logic stays isolated in `src/lib/orders/clientCopy.ts` and the OA editor.

---

## Part 1 — Duplicate Item Consolidation (Client Copy only)

Update `buildClientCopyItems` in `src/lib/orders/clientCopy.ts`:

- Before building summary group rows, walk through all items and split them into:
  - **passthrough items** (no group match) → consolidate by exact `description` (case-insensitive, trimmed). For each duplicate group: sum `quantity`, sum `amount`, and compute `unit_rate = totalAmount / totalQty` if rates differ; otherwise keep the shared rate. Keep the first occurrence's `unit`. Preserve original first-seen order so the OA item sequence is respected.
  - **group items** (MHE / MAGNET / FAN / SPOUTING) → existing summary logic (already sums qty/amount, so duplicates are naturally consolidated).
- Output stays: `[...consolidatedPassthrough, ...summarizedGroups]` with summary rows in fixed order MHE → FAN → MAGNET → SPOUTING.
- Add unit tests covering: two identical descriptions with same rate, two with different rates (effective rate = total/qty), case/whitespace normalization, mixed with grouped items.

No change to OA, BOQ, PI, or calc.

---

## Part 2 — Save Client Copy PDF against the OA

### Database (new table)

Create `public.client_copies` to store every generated Client Copy linked to its OA:

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| order_id | uuid | the OA revision this copy was generated from |
| user_id | uuid | creator |
| version_label | text | e.g. `Original`, `R1`, `R2` (computed at insert time = count of existing rows for this OA family) |
| file_path | text | path in `oa-documents` storage bucket (reuse existing bucket) |
| file_name | text | display name, e.g. `{OA_NUMBER}-CLIENT-COPY-R1.pdf` |
| line_items | jsonb | snapshot of the summarized line items (used for Excel export and re-preview) |
| charges | jsonb | snapshot |
| totals | jsonb | snapshot |
| format | order_format | MR or GMS |
| snapshot | jsonb | header / bill_to / ship_to / terms etc. used to render the PDF |
| created_at | timestamptz default now() |

RLS: same pattern as `boqs` — owner-or-admin for select/insert/update/delete.

### OA editor change (`src/pages/orders/OrderEditor.tsx`)

- After `generateOrderPDF(...)` produces the blob in `downloadClientCopy`, additionally:
  1. Upload the PDF to storage bucket `oa-documents` under `client-copies/{rootOrderId}/{filename}`.
  2. Insert a `client_copies` row referencing the current OA `id`, with the snapshot needed to re-render later.
- Trigger an event so the Revision History panel reloads.

---

## Part 3 — Unified Version History

Extend `RevisionsPanel.tsx` (already shown on the OA page) so it also fetches Client Copy rows for the OA family and renders them grouped under each OA revision (matching by `order_id`). Keep BOQ rows where they are. Add a new visual block:

```
OA R3 (Current)
  └── BOQ R1
  └── Client Copy Original   [View] [Print] [Download PDF] [Download Excel]
  └── Client Copy R1         [View] [Print] [Download PDF] [Download Excel]
```

`version_label` is computed when the row is created (count of prior client copies for this OA `order_id` → 0 = `Original`, 1 = `R1`, …).

### Action handlers

- **View** — open a new tab with a signed URL from `oa-documents` bucket (same pattern as `BoqList`).
- **Print** — open the signed URL in a new tab; the browser PDF viewer's print button is the standard UX (reuse signed URL).
- **Download PDF** — fetch the signed URL and `saveAs(blob, file_name)`.
- **Download Excel** — generate `.xlsx` on the fly from the stored `line_items` + `totals` snapshot using `xlsx` (already a dep — verify; if missing add `xlsx`). Columns: `S.No, Description, Qty, Unit, Rate, Amount`, then a totals block.

A small helper module `src/lib/orders/clientCopyExcel.ts` builds the workbook from the snapshot.

---

## Part 4 — Files touched

- **Migration** — create `client_copies` table + RLS.
- **Edit** `src/lib/orders/clientCopy.ts` — duplicate consolidation.
- **New** `src/test/clientCopy.test.ts` — extended cases for duplicates.
- **Edit** `src/pages/orders/OrderEditor.tsx` — `downloadClientCopy` now uploads + inserts row, then notifies the revisions panel via a `reloadKey` bump (already wired).
- **Edit** `src/components/orders/RevisionsPanel.tsx` — fetch client copies for the OA family, render rows with View / Print / Download PDF / Download Excel buttons.
- **New** `src/lib/orders/clientCopyExcel.ts` — build .xlsx workbook from a Client Copy snapshot.
- **Possibly new dep** `xlsx` (check `package.json`).

---

## Out of scope

- Editing Client Copy after it is saved (snapshots are immutable per user spec "must not overwrite old versions").
- Watermarking the PDF.
- Changes to OA / BOQ / PI / calc logic.
- Auto-generating a Client Copy on every OA revise — the user must click "Create Client Copy" to produce a new version (matches current UX).

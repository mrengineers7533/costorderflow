# Auto BOQ for MR + Editable Remarks + BOQ Revision History

## Goals

1. When an MR OA is created/finalized, auto-create its linked BOQ — same way as GMS, with no extra clicks. When the MR OA is revised, auto-revise the linked BOQ (already works for any format via `reviseOrder({ autoReviseBoq: true })`, just needs the initial BOQ to exist).
2. BOQ Remarks must be editable for both MR and GMS BOQs by the OA owner, and saved remarks must show in BOQ preview, PDF, and Excel.
3. Show full BOQ revision history (Original → R1 → R2 → …) inside the BOQ Folder, with View / Print / Download PDF / Download Excel on every row. Old revisions stay in the database — never overwritten.

## Scope (what stays untouched)

- OA logic, PI logic, Client Copy logic — unchanged.
- Existing GMS BOQ data flow (mapping, calculations, save) — reused as-is for MR.
- Existing `RevisionsPanel` inside OrderEditor — unchanged.
- Existing per-item approval / verification flow — unchanged.

---

## 1. Auto-create BOQ on OA save (both MR and GMS)

Today, `OrderEditor.save()` calls `syncBoqsAndPisForOrder(order)` after saving the OA. That function only updates BOQs that already exist; it does not create the first one. We will add a one-shot creation step so that — for any format — saving an OA without a linked BOQ inserts an initial BOQ row using the same mapping the manual "Create BOQ from this OA" button uses.

### Changes

- `src/lib/revisions/index.ts`
  - Add `createInitialBoqForOrder(order: OrderRecord): Promise<BoqRecord | null>`:
    - Looks up the OA family (root + revisions) and checks `boqs` for any row in the family.
    - If any BOQ exists → return null (no-op; revision sync handles updates).
    - Otherwise insert one BOQ row using exactly the same mapping as `BoqEditor`'s "new from order" branch:
      - `boq_number = deriveBoqNumber(order.oa_number)`
      - `format = order.format`
      - `revision = order.revision ?? 0`, `is_current = true`
      - `prepared_by`, `reference_oa_number`, `project_number`, `client_name` from the OA
      - `line_items` mapped from `order.line_items` (same mapping currently used in `BoqEditor.tsx` lines 147–155 and `reviseBoqFromOrder`)
      - `terms = DEFAULT_BOQ_TERMS`, `notes = order.notes || null`
      - `status = "draft"`, `verification_status = "approved"` (default)
      - `user_id = order.user_id` (matches RLS)
- `src/pages/orders/OrderEditor.tsx`
  - In `save()` after `syncBoqsAndPisForOrder(...)`, call `createInitialBoqForOrder(savedOrder)`. Wrap in try/catch with a `console.warn` so an auto-create failure never blocks the OA save.

### Why this matches "the same conditions as GMS"

The mapping above is the same one used everywhere else (BoqEditor for new BOQs, `reviseBoqFromOrder` for revisions). It is format-agnostic — no GMS-specific code paths. So MR will behave identically: BOQ row appears in the BOQ folder/list immediately after the OA is saved, then revision sync (`syncBoqsAndPisForOrder`) and `reviseOrder({ autoReviseBoq: true })` keep it in lockstep with future OA revisions.

---

## 2. Editable Remarks for both MR and GMS BOQs

`BoqEditor` already gates Remarks editing on `canEditRemarks = isOaOwner` with no format check, so MR and GMS already share the same rule. We will:

- Audit `BoqEditor.tsx` to confirm the Remarks `<Input>`/`<Textarea>` for every line item uses `disabled={!canEditRemarks}` (not `format !== "GMS"` or similar). Fix any format-specific gating if found.
- Confirm Remarks are persisted on Save (already part of `items` in payload) and round-tripped on reload.
- Confirm Remarks render in:
  - BOQ preview (BoqEditor on-screen list) — already shown.
  - PDF — `src/lib/boq/pdf.ts` already prints the `Remarks` column.
  - Excel — `src/lib/boq/excel.ts` already writes `it.remarks` in the 6th column.

No data-model changes; this is a guard-rail audit + any small UI fix to make sure MR users see the same editable Remarks field.

---

## 3. BOQ Revision History in the BOQ Folder

`RevisionsPanel` already shows OA + linked BOQ revisions with View / Print / PDF / Excel inside the OA editor, and old BOQ rows are already preserved in the DB (`is_current=false`, never deleted by the trigger). We will surface the same history directly in the BOQ Folder list so users can find and download old revisions without going through the OA.

### Changes (`src/pages/boqs/BoqList.tsx`)

- Group rows by OA family (key = `parent_order_id` of the linked OA, fallback to `order_id`). Render one parent row per family showing the **current** BOQ.
- Add an expand/collapse chevron on each row. When opened, show all revisions of that BOQ family ordered by `revision` ascending:
  - Label: `BOQ Original` for `revision = 0`, otherwise `BOQ R{revision}`.
  - Columns: BOQ number, Rev, Status (Current / Superseded / Pending / Rejected), Date, Prepared by.
  - Actions per row: **View** (`/boqs/:id`), **Print**, **Download PDF**, **Download Excel** — reusing the existing `handleDownload` / `handlePrint` / `handleExcel` helpers (which take a `BoqRecord`, so they work for any revision).
- Loading: fetch BOQ rows for a family only when its row is expanded (lazy load), mirroring the pattern in `RevisionsPanel`. For the parent row counts/badges we can reuse the already-loaded `rows`.
- Keep the existing "Show superseded" toggle for the flat view; the expanded family view always shows every revision regardless of toggle.

### Database

- No schema changes. Old BOQ revisions are already preserved (only `is_current` flips). The `boq-documents` storage bucket also keeps a per-revision history snapshot via `snapshotPreviousBoqPdf` for legacy lookups; we do not need to touch storage.

---

## Technical notes

```text
OA save (MR or GMS)
   │
   ├─► supabase.from("orders").insert/update
   │
   ├─► syncBoqsAndPisForOrder(order)        ← updates existing BOQs/PIs in family
   │
   └─► createInitialBoqForOrder(order)      ← NEW: inserts first BOQ if none in family

OA revise
   │
   └─► reviseOrder(source, { autoReviseBoq: true })
          └─► reviseBoqFromOrder(newOA, currentBoq)   ← already exists; works for both formats
```

- `createInitialBoqForOrder` is idempotent: it checks the family before inserting. Safe to call on every OA save (draft or finalize).
- All BOQ rows continue to be inserted via the existing RLS-friendly `boqs` policies (`user_id = order.user_id`).
- No changes to `OrderEditor`'s "Create BOQ from this OA" button — it still works for legacy OAs that somehow lost their BOQ.

## Out of scope

- Email notifications, verification flow, BOQ approval UI — unchanged.
- PI / Client Copy / OA PDFs — unchanged.
- Any GMS-specific calculation, charges, or pricing logic — unchanged.

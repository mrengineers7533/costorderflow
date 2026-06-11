## Goal
Extend the existing "Upload Requisition" dialog with a third mode — **General / Other Requisition** — that does not require a Cost Sheet, OA, or BOQ. Provide a downloadable Excel template so users can fill requisition data offline and upload it back. Existing Planning, PR, PO, GRN, CS, OA, BOQ, PI and PDF logic stay untouched.

## 1. Database (one migration)
Existing `requisitions` table has `order_root_id` and `boq_id` as `NOT NULL`. To support unlinked requisitions:

- `ALTER TABLE public.requisitions ALTER COLUMN order_root_id DROP NOT NULL;`
- `ALTER TABLE public.requisitions ALTER COLUMN boq_id DROP NOT NULL;`
- Add `kind text NOT NULL DEFAULT 'project'` with check `kind in ('project','general')`.
- Add `title text` (free-form name for general requisitions, e.g. "Workshop consumables – Nov 2026").
- Add new RPC `next_general_requisition_number()` → `REQ/GEN/YY-YY/0001` (new counter row in `requisition_counters` keyed by a sentinel UUID, or new tiny table `general_requisition_counters`). New counter table is cleaner — `general_requisition_counters(financial_year text PK, last_number int)`.
- Grants + RLS policies on the new counter table mirror `requisition_counters`.

Existing RLS on `requisitions` already keys off `user_id` / module access, so nullable linkage columns are safe. Triggers/functions that read `order_root_id` (e.g. `get_requisition_by_token`) already tolerate missing linked BOQs (LEFT JOIN).

## 2. Excel template
Add a static template generator (client-side, using existing `xlsx` lib already in the project for BOQ/PI exports).

Sheet **Requisition Items** with columns:
`S.No | Item Description | Make | Size / Model | Material | Qty | Unit | Remarks`

Sheet **Instructions** with usage notes (one row per item, do not rename headers, leave S.No blank or sequential).

A "Download Template" button in the new tab triggers `exportRequisitionTemplate()` in `src/lib/requisition/uploadTemplate.ts`.

## 3. Upload dialog changes (`src/pages/requisitions/RequisitionsList.tsx`)
- Add a third `TabsTrigger` value `"general"` next to existing "By Project CS #" and "By OA / BOQ".
- General tab contents:
  - Text input: **Requisition Title** (required).
  - Text input: **Client / Department** (optional, stored in `client_name_override`).
  - Textarea: notes.
  - File picker: accepts `.xlsx`, `.xls`, `.pdf` (same as today).
  - "Download Excel Template" link button.
- `canSubmit` extended: general mode requires title + file.
- New branch in `submit()`:
  - Skip `resolveLinkage`, family token, and BOQ lookup.
  - Call new RPC `next_general_requisition_number` for the number.
  - Insert `requisitions` row with `kind='general'`, `order_root_id=null`, `boq_id=null`, `boq_revision=0`, `title`, `client_name_override`, `source='uploaded'`.
  - If file is `.xlsx`/`.xls`, parse it client-side and insert rows into `requisition_items` with `boq_item_id = 'gen-<row>'`, mapping the template columns. PDF uploads skip parsing (file is just stored).
  - Upload file to `requisition-uploads` bucket using existing path scheme.

Existing project/OA branches are unchanged.

## 4. List + detail rendering
- `RequisitionsList` table: show `title` (when `kind='general'`) in place of OA/BOQ columns; add a small "General" badge.
- `RequisitionDetail`: when `kind='general'`, hide OA/BOQ/Cost Sheet sections, render `title`, uploaded file link, parsed items table, notes. All existing project requisition rendering untouched.
- No changes to PR/PO/GRN selection flows — general requisitions remain visible there only as items if/when a user picks them; out of scope to wire automatic flow (call out explicitly).

## 5. Files touched
```text
supabase/migrations/<new>.sql           -- nullable cols, kind, title, general counter + RPC
src/lib/requisition/uploadTemplate.ts   -- new: build & download .xlsx template
src/lib/requisition/parseUpload.ts      -- new: parse uploaded .xlsx into item rows
src/pages/requisitions/RequisitionsList.tsx
                                         -- new "General" tab, submit branch, badge in table
src/pages/requisitions/RequisitionDetail.tsx
                                         -- conditional render for kind='general'
src/integrations/supabase/types.ts       -- regenerated after migration
```

## 6. Explicitly out of scope
- No change to Planning, PR, PO, GRN, Cost Sheet, OA, BOQ, PI, or PDF generation.
- No change to existing project/OA upload branches or to `create-requisition` edge function.
- No automatic PR/PO generation from general requisitions in this pass.

## Open question
Should general requisitions appear in **Purchase → Requisitions** lists for PR/PO creation, or stay isolated as a record-only upload? Default in this plan: visible in the list with a "General" badge, but NOT auto-pushed into PR flow.

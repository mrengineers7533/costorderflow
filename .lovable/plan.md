
# Data Consistency Check

A read-only validation feature that verifies whether data flows correctly from BOQ → Requisition → Raw Materials → Annexure. No existing flow is modified.

## 1. Overview page — `/requisitions/consistency`

Linked from a new toolbar button "Consistency Check" on the Requisitions list.

Columns:
- OA / BOQ reference (or "General" for general requisitions)
- Requisition number
- BOQ item count
- Requisition Finished Goods count
- BOQ vs FG status (Matched / Mismatch / N/A) + difference
- Requisition Raw Material total count
- Annexure Created count
- Annexure Not Created count
- RM vs Annexure status (Matched / Mismatch) + difference
- Overall status badge

Features:
- Filters: status (All / Matched / Mismatch only / N/A), search by OA/BOQ/Req number, source (Generated / Uploaded / General).
- Summary header tiles: total requisitions checked, total matched, total mismatched, N/A.
- Mismatch rows highlighted with destructive/amber styling and a warning icon. Each mismatched cell shows the delta (e.g. `+2` or `-1`).
- Eye/link icon → opens that requisition's detail page on the new Consistency tab.

## 2. Per-requisition tab — Requisition Detail

New tab "Consistency" inside `RequisitionDetail.tsx` alongside the existing tabs. Shows for that single requisition:

- Summary card with:
  - OA / BOQ reference (or "General Requisition — Not Applicable" for the BOQ check)
  - BOQ item count
  - Requisition Finished Goods item count
  - Requisition Raw Material total count
  - Annexure Created count
  - Annexure Not Created (pending) count
- Two check rows, each with a green "Matched" badge, red "Mismatch" badge with delta, or grey "Not Applicable" badge:
  - Check 1: BOQ vs Finished Goods (N/A for general requisitions)
  - Check 2: Raw Material total vs (Annexure Created + Not Created)
- When mismatched, an Alert (destructive variant) explains exactly what's missing (e.g. "BOQ has 12 items but Requisition has 10 Finished Goods — 2 missing").

## 3. Count definitions

- BOQ item count = number of rows in `boqs.line_items` for the BOQ linked to the requisition (`requisitions.boq_id`).
- Requisition Finished Goods count = `requisition_items` rows for the requisition.
- Raw Material total = `requisition_raw_materials` rows for the requisition.
- Annexure Created = raw material rows where `annexure_status = 'created'` AND `annexure_id` points to an active (non-cancelled) annexure.
- Annexure Not Created = raw material rows where `annexure_status` is null OR the linked annexure is cancelled.
- Matched when counts are strictly equal; otherwise Mismatch.
- General requisition detection: `requisitions.source = 'uploaded'` AND `boq_id is null` (or no matching BOQ). BOQ vs FG check is marked N/A and not counted toward mismatch totals.

## 4. Highlighting rules

- Matched → green Badge.
- Mismatch → red Badge with `Δ` value; row gets `bg-destructive/5` and a `AlertTriangle` icon.
- N/A → muted Badge.
- Overall row status = Mismatch if any non-N/A check fails, else Matched.

## 5. Files to add / edit

- `src/pages/requisitions/ConsistencyCheck.tsx` — new overview page.
- `src/pages/requisitions/RequisitionDetail.tsx` — add "Consistency" tab (new component `ConsistencyTab` inline or in `src/components/requisitions/ConsistencyTab.tsx`).
- `src/lib/requisition/consistency.ts` — shared helper that loads counts for one or many requisitions and returns `{ boqCount, fgCount, rmTotal, annexCreated, annexPending, boqVsFg, rmVsAnnex, isGeneral }`.
- `src/App.tsx` — register `/requisitions/consistency` route.
- `src/pages/requisitions/RequisitionsList.tsx` — add toolbar Button linking to the new page (no other changes).

## 6. Non-goals / guarantees

- No writes to any table. All queries are SELECT-only.
- No edits to BOQ, Requisition upload/parse, Planning, PR, PO, GRN, PDF, or Reset code paths.
- No schema changes / no migrations.

## Technical notes

- Data loading: single page-level fetch joins `requisitions` → `requisition_items` (count), `requisition_raw_materials` (rows with `annexure_status`, `annexure_id`), and `boqs` (line_items length). Use `supabase.from(...).select('id', { count: 'exact', head: true })` per requisition batched with `Promise.all`, or aggregate client-side after one `in()` fetch keyed by `requisition_id` to stay within one round trip per table.
- Cancelled annexure detection: fetch distinct `annexure_id`s from raw materials, then `requisition_annexures.select('id,status').in('id', ids)`; treat `status = 'cancelled'` linked rows as Not Created.
- Reuse existing `Badge`, `Card`, `Alert`, `AlertTriangle` (lucide) components and design tokens — no new colors.

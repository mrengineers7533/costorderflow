## Goal

Add an **Annexure Folder** with search, plus **Cancel** and **Recreate** actions for any annexure. All status changes stay linked to Generated Requisition, Raw Materials, and Annexure Reports. No existing module is altered beyond what's listed below.

## Scope

- New page: `src/pages/requisitions/AnnexureFolder.tsx` at route `/requisitions/annexures`.
- New sidebar entry "Annexure Folder" under Requisitions.
- Small additions to existing `src/pages/requisitions/RequisitionPlan.tsx` (link to folder, recreate flow, badge says "Cancelled" when applicable).
- One migration to add cancellation fields on `requisition_annexures`.
- No changes to single-requisition Detail, Manufacturing → Requisition, RM Master, BOQ/OA/PI, Purchase, Admin, permissions, or ES Page flow.

## 1. Annexure Folder page

Route: `/requisitions/annexures`. New top-level page accessible from the sidebar.

Layout:

```text
+--------------------------------------------------------------+
| Annexure Folder                                              |
| [Search: Lot No / Type / Raw Material / Status / Date / By]  |
| [Status filter: All | Active | Cancelled]                    |
+--------------------------------------------------------------+
| Lot 01  ┌─ Machine List  · 10-Jun-26 · pc.2@... · Active     |
|         │     12 rows · Grand Total 480 kg   [View][Cancel][PDF]
|         ├─ Steel List    · 10-Jun-26 · pc.2@... · Cancelled  |
|         │     5 rows ...                       [View][Recreate]
|         └─ Outside Purch · ...                                |
| Lot 02  ...                                                  |
+--------------------------------------------------------------+
```

Behavior:
- Lists every annexure ever created, grouped by **Lot No** (one annexure can span multiple lots; in that case it appears under each of its lots).
- Splits each annexure into three logical "annexure types" derived from the `plan_status` of its rows: **Machine List**, **Steel List**, **Outside Purchase**. Each type sub-card shows its own row count + grand total.
- Columns per annexure entry: Lot No, Type, Created Date, Created By (email from `profiles`), Status (Active / Cancelled), row count, grand total.
- **View** opens an inline modal with the full snapshot rows (lot, material, size, make, unit, qty) and a grand total — read-only.
- **Download PDF** uses the same renderer already in `RequisitionPlan.tsx` (extracted into a tiny shared helper `src/lib/requisition/annexurePdf.ts`).
- **Cancel** (only on Active): confirm dialog → sets annexure to Cancelled and clears `annexure_status` on every contributing `requisition_raw_materials` row (so they become available for a new annexure again).
- **Recreate** (only on Cancelled, and only from the folder): opens the Plan page for the original requisition set with the matching Lots pre-selected, so the user can click Create Annexure again. The new annexure is independent (new id, new created_at). The cancelled one stays for history.

Search panel:
- Single text input plus filter chips. Searches across:
  - Lot No (substring on `requisition_annexures.lot_numbers`)
  - Type (Machine / Steel / Outside) — chip filter
  - Raw Material name (substring on `requisition_annexure_rows.material`)
  - Status (Active / Cancelled) — chip filter
  - Created Date range (from/to date pickers)
  - Created By (substring on profile email/full_name)
- All filters compose with AND. The page fetches `requisition_annexures` + their `requisition_annexure_rows` once and filters in memory (the data set is small per project).

## 2. Cancel + Recreate flow

- Cancel:
  1. `update requisition_annexures set cancelled_at=now(), cancelled_by=<uid>, status='cancelled' where id=<id>`.
  2. `update requisition_raw_materials set annexure_status=null, annexure_id=null where annexure_id=<id>` so downstream tabs immediately drop the "Annexure Created" badge for those rows.
  3. Local state refresh on the folder page and on the Plan page (already keyed off `annexure_status`).
- Recreate:
  - Just opens `/requisitions/plan?ids=<original ids>` with a query param `?relotSelect=Lot01,Lot02` that pre-checks the matching lots in the Lot selector. Existing Create Annexure flow does the rest.
  - The cancelled annexure remains visible in the folder with its Cancelled badge.

## 3. Linking & badge updates in existing tabs

- The `annexure_status` flag on `requisition_raw_materials` is already the single source of truth used by Generated Requisition, Raw Materials, and Annexure Reports tabs. Because Cancel clears that flag on every contributing row, those tabs automatically stop showing "Annexure Created" — no further changes to the Plan page rendering logic.
- Small tweak on the Plan page: when displaying **Saved annexures** mode in the Reports tab, show a `Cancelled` badge next to cancelled batches and grey them out (read-only). Active batches keep today's behavior.

## 4. Database migration

Additive only — no breaking changes:

```sql
ALTER TABLE public.requisition_annexures
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.requisition_annexures
  DROP CONSTRAINT IF EXISTS requisition_annexures_status_check;
ALTER TABLE public.requisition_annexures
  ADD CONSTRAINT requisition_annexures_status_check
  CHECK (status IN ('active','cancelled'));

CREATE INDEX IF NOT EXISTS idx_requisition_annexures_status
  ON public.requisition_annexures(status);
```

Existing RLS / GRANTs unchanged.

## 5. Files touched

- New: `src/pages/requisitions/AnnexureFolder.tsx`
- New: `src/lib/requisition/annexurePdf.ts` (extracted helper, identical output)
- Edited: `src/App.tsx` (add route)
- Edited: `src/components/AppSidebar.tsx` (add "Annexure Folder" link under Requisitions)
- Edited: `src/pages/requisitions/RequisitionPlan.tsx`
  - Add toolbar link "Annexure Folder".
  - On load, read `relotSelect` query param to pre-check matching lots.
  - In Reports tab "Saved annexures" mode, show `Cancelled` badge + disable PDF when cancelled. (Active behavior unchanged.)
  - Use the extracted PDF helper (no behavior change).
- Edited: `src/lib/requisition/types.ts` — add optional `status: 'active'|'cancelled'`, `cancelled_at`, `cancelled_by`, `cancel_reason` to `AnnexureRecord`.
- New migration file under `supabase/migrations/`.

## Out of scope (explicitly unchanged)

- Single-requisition Detail page, Manufacturing flow, RM Master, BOQ/OA/PI, Admin pages, ES Page, permissions model, PDF templates.
- Annexure row schema (`requisition_annexure_rows`) — unchanged; snapshots stay immutable.
- No deletion of any annexure — only soft "Cancelled" status.

## Acceptance

- A new **Annexure Folder** page lists every annexure, grouped by Lot, with Type, Created Date, Created By, Status, row count, grand total, and a working search across all listed fields.
- Cancelling an annexure flips its status to **Cancelled**, removes the "Annexure Created" badge from its rows in Generated Requisition / Raw Materials / Annexure Reports tabs instantly, and keeps the cancelled annexure visible in the folder.
- Recreating from a cancelled annexure opens the Plan page with the matching Lots pre-selected; the new annexure is a fresh active entry with its own created_at; the cancelled one stays for history.
- All existing flows, calculations, ES Page behavior, autosave, single-requisition view, and permissions continue to work exactly as today.

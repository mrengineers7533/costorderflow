# Plan — Add hidden "Make" column across OA-linked modules

Mirror the existing OA **Make** column (the verbatim `make_label` per item) into BOQ, PI, Requisition, Purchase and Manufacturing views. Column stays **hidden by default** everywhere and can be toggled on-screen and in print/export.

## Scope summary

| Module | Source of "Make" | Work needed |
|---|---|---|
| OA (orders) | `LineItem.make_label` | Already exists — no change |
| PI | Reuses `LineItem` → already carries `make_label` from OA | Add column (hidden by default) to PI editor table + PDF/Excel toggle |
| BOQ | New optional `make` field on `BoqLineItem` | Propagate from OA on generation/sync; add hidden column to BOQ editor, PDF, Excel, design review, distribution PDFs |
| Requisition | `requisition_raw_materials.make` already exists | Add hidden column in `RequisitionDetail`, `PublicRequisition`, and `requisition/pdf.ts` |
| Purchase / Manufacturing | Reads BOQ + Requisition | Inherits via the BOQ + Requisition changes; add hidden column in `ApprovedBoqDetailPage` items table and any purchase/manufacturing tables |

## Behavior contract (applies everywhere)

- Column is **off by default** for both on-screen tables and PDF/Excel exports.
- Each table gets a small "Columns" toggle (reuse `PdfColumnVisibility` pattern) where the user can flip "Make" on per-session. Preference is stored in `localStorage` per surface (e.g. `boq.columns.make`, `req.columns.make`) so the choice survives reloads but does not affect other users or saved records.
- PDF / Excel export honors the same toggle: if user enables Make before exporting, the column is included; otherwise the output is **byte-identical to today**.
- No changes to totals, calculations, layouts of other columns, RLS, workflows, or stored snapshots. The column simply renders if a value is present and the toggle is on.

## Technical details

### 1. BOQ
- `src/lib/boq/types.ts`: add optional `make?: string` to `BoqLineItem`. Backward compatible (existing rows have it `undefined`).
- BOQ generator (`src/lib/revisions/index.ts` `syncBoqsAndPisForOrder` / `createPendingBoqRevision` and any `deriveBoqLineItems` helper): copy `make_label` from OA `LineItem` → `make` on the new `BoqLineItem`. Existing BOQs untouched until next sync/revision.
- `src/pages/boqs/BoqEditor.tsx`: add a "Make" column gated by a column-visibility state (default hidden) with a toggle button.
- `src/lib/boq/pdf.ts` + `src/lib/boq/excel.ts` + `src/lib/boq/pdfDistribution.ts`: accept a `showMake` flag (default `false`); when `true`, insert a "Make" column. Existing callers that don't pass it behave exactly as today.
- `src/components/boqs/DesignReviewPanel.tsx` and `DistributeBoqDialog.tsx`: surface the same toggle when triggering exports.

### 2. PI
- `src/pages/pi/PiEditor.tsx`: add a hidden "Make" column (reads `line_items[].make_label`) with a column-visibility toggle.
- `src/lib/pi/pdf.ts` + `src/lib/pi/excel.ts`: accept and respect a `showMake` flag.

### 3. Requisition
- `src/pages/requisitions/RequisitionDetail.tsx` and `src/pages/requisitions/PublicRequisition.tsx`: add hidden "Make" column inside the grouped RM table (renders `rrm.make`).
- `src/lib/requisition/pdf.ts`: optional `showMake` flag adding a Make column to the grouped autoTable.

### 4. Purchase / Manufacturing
- `src/pages/modules/ApprovedBoqModule.tsx` (read-only BOQ items table) and any analogous tables in `src/pages/purchase/PurchaseDetail.tsx` / `src/pages/manufacturing/ManufacturingDetail.tsx`: add hidden "Make" column reading from `BoqLineItem.make` (will be empty until BOQ is regenerated/synced from OA).

### 5. Shared column-toggle UX
- Reuse `src/components/orders/PdfColumnVisibility.tsx` pattern (`Columns3` button + popover with checkboxes). For modules without an existing column-defs file, add a tiny per-module `columns.ts` listing the `Make` toggle only (more columns can be added later).

## Explicitly out of scope / untouched

- No DB migrations (all needed columns already exist in `requisition_raw_materials`; `boqs.line_items` is `jsonb`).
- No edits to OA editor, OA PDF, pricing, calc, approval, revision rules, RLS, edge functions, `supabase/config.toml`, or notification feature.
- No back-fill of existing BOQ rows. Make value only appears on BOQs generated/synced after this change; older BOQs simply render the column blank when toggled on.

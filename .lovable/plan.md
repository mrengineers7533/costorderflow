
# Phase 1 — Review & Edit fields, FG↔RM structure, auto Material Category

This phase adds only backward-compatible additions to the existing Create Requisition (Auto / Manual) flow and the Requisition Detail view. Direct Requisition Upload, Lot, Purchase, Annexure, PO, GRN, numbering, approvals, notifications, permissions, PDFs, and calculations are **not** touched. Phases 2–5 (MR/3P classification, BOM upload extensions, Item Master, vendor prices, lot/purchase/PO tests) are separate follow-up plans; each will be presented before implementation.

## Current-state facts (verified)

- Review & Edit lives in `src/components/manufacturing/CreateRequisitionDialog.tsx` (`step === "review"`). Its per-RM row is `RmRow = { make, material, size_model, qty_per_unit, unit, notes }` and per-FG payload sends `edited_items[].raw_materials` to the `create-requisition` edge function.
- `requisition_items` stores FG snapshot with `model_number, description, quantity, unit, remarks, fg_snapshot(jsonb)`. It has no explicit `fg_make` column but the full BOQ line item is preserved inside `fg_snapshot` (jsonb).
- `requisition_raw_materials` already has `make, material, size_model, qty_per_unit, fg_quantity, required_qty, unit, notes, plan_status, lot_no, annexure_status, po_status`. It does **not** currently have `rm_weight`, `material_category`, or `remarks` (only `notes`).
- `fg_raw_material_map.raw_materials` (jsonb array) currently carries `{make, material, size_model, qty_per_unit, unit, notes}` per RM — no `weight`, no `material_category`.
- `create-requisition` edge function inserts RM rows and computes `required_qty = qty_per_unit * fg_quantity`. Downstream tables key off `requisition_raw_materials.id` — safe extension surface.

## Scope of Phase 1

1. Schema additions (all nullable, no rewrites, no data migration).
2. Category auto-select helper + admin-editable keyword rules (fallback only).
3. Review & Edit UI: expose the additional fields and let user override Category.
4. Requisition Detail: show new fields read-only where appropriate.
5. Regression tests for FG↔RM scaling, category resolution, and backward compatibility.

## 1. Schema changes (single migration, additive only)

New nullable columns:

- `public.requisition_raw_materials`
  - `rm_weight numeric NULL`
  - `remarks text NULL` (kept separate from `notes`, which continues to carry mapping/system notes)
  - `material_category text NULL`
  - `material_category_source text NULL CHECK (source IN ('bom','master','rule','manual', NULL))`
- `public.requisition_items`
  - `fg_make text NULL` (denormalized copy — `fg_snapshot` remains canonical)
  - `fg_uom text NULL` (mirror of `unit`; added so downstream code can distinguish FG UOM from RM UOM without parsing snapshot)
- `public.fg_raw_material_map` (jsonb schema is free-form; **no DDL change** — the object shape simply extends to allow optional `weight` and `material_category` keys)

New table for the category rules fallback:

- `public.rm_category_rules`
  - `id uuid pk`, `pattern text` (case-insensitive contains), `category text`, `priority int`, `active bool`, `created_by`, `created_at`, `updated_at`
  - RLS: SELECT to `authenticated`; INSERT/UPDATE/DELETE admin-only.
  - GRANTs per project convention (`authenticated` SELECT, `service_role` ALL).

Rollback: drop the four new columns and the `rm_category_rules` table. No existing data is rewritten.

## 2. Category resolution helper

New module `src/lib/requisition/materialCategory.ts` with `resolveMaterialCategory({ bomCategory, itemMasterCategory, material, sizeModel }) → { category, source }`. Resolution order (matches user requirement):

1. `bomCategory` explicitly provided → source `bom`.
2. `itemMasterCategory` (Phase 3 will populate; Phase 1 always `null`) → source `master`.
3. Longest-priority match from `rm_category_rules` against `material` and `size_model` → source `rule`.
4. Otherwise `null` (pending) → user selects manually in Review & Edit.

Seed rules (idempotent SQL insert in the same migration): `MS SHEET → MS Sheet`, `GI SHEET → GI Sheet`, `SS SHEET → SS Sheet`, `PIPE → Pipe`, `MOTOR → Motor`, `PULLEY → Pulley`, `FLAT → Flat`, `BOLT → Bolt/Fastener`, `SHAFT → Shaft`, `BEARING → Bearing`. These are editable in Phase 3 admin UI; Phase 1 seeds only.

`mapCategoryToPlanStatus` (already exists in `parseUpload.ts`) is left untouched — it maps category text to the existing `plan_status` enum for lot planning.

## 3. UI: Create Requisition — Review & Edit

Edit `src/components/manufacturing/CreateRequisitionDialog.tsx` only. The two-step flow (Select → Review) and Auto/Manual mode selector are unchanged.

Per-FG card gains a header row:

```
Finished Good | FG Qty | FG UOM | FG Make
```

`FG Qty` and `FG UOM` display from BOQ line item and are read-only in Phase 1 (editing FG qty is out of scope — Purchase already recomputes required qty when FG qty changes at BOQ revision time). `FG Make` is a text input that defaults to the resolved make from `buildMakeResolver` (already imported) and is editable.

Per-RM row gains four new columns after the existing set, keeping the current column order intact so the change is additive:

```
Make | Material | Size / Model | Qty/Unit | UOM | Weight | Remarks | Category | Notes | ⋯
```

- `Weight` — numeric input, nullable.
- `Remarks` — free text.
- `Category` — combobox populated from distinct `rm_category_rules.category` values plus manual entry; defaults to `resolveMaterialCategory(...)` result. When source is `rule` a small "Auto" pill shows next to the value; user override sets source to `manual`.
- `Notes` — unchanged (system/mapping notes).

`Load from Master` and `Add Row` behavior unchanged; new fields are pulled from the extended jsonb shape when present, otherwise blank.

Submission: `create()` sends the extended per-RM shape:

```ts
{ make, material, size_model, qty_per_unit, unit, notes,
  rm_weight, remarks, material_category, material_category_source }
```

`fg_make` is sent per FG in a new `edited_items[].fg_make` field.

## 4. Edge function: `supabase/functions/create-requisition/index.ts`

Backward-compatible extension:

- Accept new optional keys per RM (`rm_weight`, `remarks`, `material_category`, `material_category_source`) and per edited FG (`fg_make`).
- Populate the new columns on insert. When absent (old clients or the auto path), fall back to `resolveMaterialCategory` server-side using the FG map's optional `material_category`/`weight` and the seeded `rm_category_rules`.
- `requisition_items.fg_make` is set from `edited_items[].fg_make` if provided, else from `buildMakeResolver` equivalent applied to `line_items`, else `null`.
- Existing behavior (`required_qty = per * fgQty`, unmapped placeholder row, module gate, admin bypass, family token, next_requisition_number RPC, `included_in_requisition = true`) is preserved verbatim.

## 5. Requisition Detail read-side

`src/pages/requisitions/RequisitionDetail.tsx` currently renders RM rows using `make, material, size_model, qty_per_unit, unit, required_qty, notes`. Add read-only columns for `Weight`, `Remarks`, `Category`. Category cell is editable inline for authorized users (same `can_edit_module('requisitions')` gate the existing edit actions use); saving PATCHes `requisition_raw_materials` and updates `material_category_source = 'manual'`. All existing action buttons, lot flow, purchase links, PDF export, and notifications are untouched.

## 6. Types

- Extend `RequisitionRawMaterialRecord` in `src/lib/requisition/types.ts` with the four new optional fields.
- Extend `RequisitionItemRecord` with optional `fg_make`, `fg_uom`.
- Extend `FgRawMaterialMapRow.raw_materials[]` with optional `weight?: number` and `material_category?: string`.
- Regenerate `src/integrations/supabase/types.ts` automatically after the migration runs.

## 7. Regression tests

New file `src/test/requisitionReviewEditPhase1.test.ts`:

1. `resolveMaterialCategory` — BOM value wins over master and rule.
2. `resolveMaterialCategory` — rule match wins when BOM/master absent; unknown returns `null`.
3. Existing `parseGroupedRequisitionExcel` test suite still passes untouched (no code change to `parseUpload.ts`).
4. Edge-function contract test (using existing helpers/fakeSupabase pattern): posting old-shape `edited_items` (without new fields) still succeeds and produces the same `requisition_raw_materials` rows as today.
5. Edge-function contract test: new fields are persisted and `required_qty = qty_per_unit * fg_quantity` unchanged.
6. Snapshot test on `CreateRequisitionDialog` in Review step verifies FG Make and per-RM Weight/Remarks/Category cells render and the existing columns are unchanged.

## 8. Backward compatibility & rollback

- All new columns and jsonb keys are optional; existing reads of `requisition_raw_materials` (Purchase, Annexure, PO, GRN, PDF, notifications, admin reports) continue to select the columns they already select — new columns are ignored.
- Edge function accepts both old and new client payloads.
- Direct Requisition Upload path (`parseUpload.ts`) is not modified in Phase 1; when Phase 3 extends the BOM upload spec, direct upload will opt-in through a separate additive change.
- Rollback = drop new columns, drop `rm_category_rules`, revert the two TypeScript files and edge function. No historical data conversion.

## Technical checklist

- One migration: 4 columns + 1 table + seed rules + GRANTs + RLS.
- `src/lib/requisition/materialCategory.ts` (new).
- `src/lib/requisition/types.ts` (extend interfaces).
- `src/components/manufacturing/CreateRequisitionDialog.tsx` (Review step UI + submit payload).
- `src/pages/requisitions/RequisitionDetail.tsx` (three read/edit columns).
- `supabase/functions/create-requisition/index.ts` (accept + persist new fields; server-side category fallback).
- `src/test/requisitionReviewEditPhase1.test.ts` (new).

## Explicitly out of scope (deferred to later phases)

- Phase 2: `make_classification` table, MR/GMG/GME vs 3P routing, manual override with audit.
- Phase 3: Final BOM upload extensions, `raw_material_items` master, admin UI for category rules.
- Phase 4: `vendor_item_prices`, Purchase Planning price comparison, snapshot on selection, pending-only balance tracker.
- Phase 5: Full Annexure / PO / GRN integration regression suite.

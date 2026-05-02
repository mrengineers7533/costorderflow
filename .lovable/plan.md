## Goal

When an OA contains both MR and GMS items, the two should calculate completely independently — each with its own P&F, GST, freight, discount, landed-cost, etc. Switching the editor's MR/GMS toggle swaps **both** the visible items **and** the charges block. Each side's totals, preview and PDF use only its own items + its own charges. When the OA has only one make, behaviour stays exactly as today.

## Changes

### 1. Data model — split charges per make
**`src/lib/orders/types.ts`**
- Keep `Charges` shape as-is (avoid a breaking schema change).
- Add an optional sibling field on `OrderRecord`: `charges_gms?: Charges`. When the OA is mixed, `charges` holds the MR charges and `charges_gms` holds the GMS charges. When the OA is single-make, only `charges` is used (as today).
- `totals` on the row is the active-format totals (for backward compatibility with the saved JSON used by lists/search). Both side totals are recomputed at render/PDF time.

The DB columns don't change — `charges` jsonb continues to be MR (or single-make) charges; `charges_gms` is a new optional jsonb. Add a migration adding the column.

### 2. Editor wiring
**`src/pages/orders/OrderEditor.tsx`**
- Add `chargesGms` state alongside the existing `charges` state. Load it from `row.charges_gms` if present, otherwise initialise from defaults.
- Introduce a derived `activeCharges` / `setActiveCharges` pair: when `splitMode` is true, they point at `chargesGms` if `format === "GMS"` else `charges`. When not in split mode, they always point at `charges`.
- Replace every `charges` / `setCharges` reference inside the Charges & Totals column, the Ex-works Murthal panel, the EXW Turkey panel, the discount controls, and the totals `useMemo` with the active pair. The format-gated blocks (`format === "MR" && …` and `format === "GMS" && …`) already key off the active format, so their inputs will naturally bind to the right side.
- `totals` (and the words/snapshot) compute from `itemsWithAmounts` (already filtered by active format) + `activeCharges`.
- Save payload includes both `charges` (MR side, or the only side) and `charges_gms` (GMS side, only when split).

### 3. PDF generation — render each side with its own charges
**`src/pages/orders/OrderEditor.tsx` → `downloadPDF`**
- In `splitMode`, build the chosen side's record using that side's items **and** that side's charges (`charges` for MR, `chargesGms` for GMS). Today it reuses the shared `charges` object — that's the bug to fix.
- Single-make path unchanged.

### 4. Preview
**`src/components/orders/OrderPreview.tsx`**
- No structural change. The editor already passes `charges` and items into the preview; once the editor swaps `activeCharges` based on the format toggle, the preview reflects the right side automatically.

### 5. Defaults / initialisation
**`src/lib/orders/defaults.ts`**
- Reuse the existing default charges factory for both sides. No new defaults needed.

### 6. Revisions / snapshots
**`src/pages/orders/OrderEditor.tsx` → `snapshotOrder`** and the revision flow include `charges_gms` in the snapshot so revising a mixed OA preserves both sides.

### 7. Database
- Migration: `ALTER TABLE public.orders ADD COLUMN charges_gms jsonb;` (nullable, default null). RLS unchanged.

### Out of scope
- PI editor (`src/pages/pi/PiEditor.tsx`) — PIs are single-format, so no split there.
- BOQ — unchanged.
- The Ex-works Murthal / EXW Turkey panel UIs themselves — they keep their current controls; they just bind to whichever charges side is active.
- No change to the `OrderFormat`/`detectFormat` heuristic.

## Acceptance

- Mixed OA: switch toggle MR ⇄ GMS — items, charges inputs, totals, words, and preview all swap. Editing MR P&F % does not affect GMS totals and vice-versa.
- Mixed OA: download PDF in MR mode → MR PDF uses only MR items + MR charges. Switch to GMS, download → GMS PDF uses only GMS items + GMS charges.
- Single-make OA (only MR or only GMS): no behavioural change; `charges_gms` stays null.
- Saving + reopening a mixed OA restores both charges blocks intact.

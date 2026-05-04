## Goal

A single uploaded cost sheet stays available forever and can produce two completely independent document trees: one for **MR** and one for **GMS**. Finalizing on one side never blocks, hides or overwrites the other.

## What's already in place (no change needed)

- `cost_sheets` table is a standalone, user-owned, persistent list. Uploading does not "consume" the sheet — it stays in the picker after Apply.
- `CostSheetPicker` lists every uploaded sheet with realtime status; the `Apply` button can be pressed any number of times.
- BOQs and PIs are already separate rows keyed off an OA (`order_id` / `reference_oa_id`), so two OAs from the same sheet automatically yield independent BOQ/PI families.

## What's broken vs the requirement

Today the OA editor treats a cost sheet that contains **both** MR and GMS items as a single OA row with internal "split mode" — one DB record, two PDFs via a dropdown. The user wants **two distinct OA records** (separate `oa_number`, separate finalize state, separate revisions, separate BOQ/PI children) generated from the same sheet.

Also, after finalizing the MR OA there is no obvious "now make the GMS OA from the same sheet" entry point — the user has to navigate back to Orders → New → find the sheet → Apply again.

## Plan

### 1. Add a "Format chooser" step after Apply (chooser page)

Update `src/pages/orders/NewOrderChooser.tsx`:

- When `CostSheetPicker.onApply` fires, do **not** auto-navigate. Instead show a small inline panel:
  - "This cost sheet contains: 4 MR items, 2 GMS items" (computed from extracted `line_items[].make` via `inferItemMake`).
  - Two buttons: **Create MR OA** and **Create GMS OA**, both enabled regardless of detected mix (user can override).
  - A note: "You can come back to this cost sheet anytime to create the other format."
- Each button navigates to `/orders/new/edit` with router state `{ extracted, forcedFormat: "MR" | "GMS" }`.

### 2. Honor `forcedFormat` in the OA editor

In `src/pages/orders/OrderEditor.tsx` `applyCostSheet` + initial-state effect:

- Read `forcedFormat` from `location.state`. When present:
  - Set `format` to that value and `setAutoFormat(false)`.
  - **Filter** `data.line_items` to only items whose `make` matches `forcedFormat` (using the same `inferItemMake` rule already in the file). Items tagged `OTHER` go into MR by default but can be edited.
  - Apply `data.charges` only into the matching slot (`chargesMr` or `chargesGms`). The other slot stays at `emptyCharges`.
- Result: the saved `orders` row is single-format, with a clean `oa_number` from the matching counter (`next_oa_number('MR'|'GMS', fy)`), and downstream BOQ/PI inherit that format. No split-mode UI for this OA.
- Legacy split-mode behaviour stays intact when `forcedFormat` is absent (e.g. opening an old OA that already has both makes), so existing OAs keep working unchanged.

### 3. Make the cost sheet picker show "what's already been generated"

In `src/components/orders/CostSheetPicker.tsx`:

- After loading sheets, run a second query: `orders.select('id, oa_number, format, cost_sheet_number, status').in('cost_sheet_number', [...])` matched on the sheet's `extracted.cost_sheet_number` (fallback: `extracted.reference`).
- For each sheet row, render two small badges next to the Apply button:
  - **MR OA** — either `Create MR OA` (link to chooser-with-forcedFormat) or `View MR OA · MROA/…` (link to `/orders/<id>`).
  - **GMS OA** — same pattern.
- This makes the dual-format workflow obvious without changing the upload/parse flow.

### 4. No DB schema changes

`orders.cost_sheet_number` already exists and is persisted — that's how we link sheet ↔ OA. No migration required. Existing rows keep working. Backward compatible.

### 5. BOQ / PI flows — verify only

- `BoqEditor` already pre-fills from the parent OA and inherits its `format` (line 82 of `BoqEditor.tsx`). Two OAs → two BOQ trees automatically.
- `proforma_invoices` is keyed by `reference_oa_id` / `format`. Same guarantee.
- No code changes needed; only confirm in QA after step 1–3 ship.

### 6. Copy / UX

- Chooser headline updated: "Choose which company this OA is for. The cost sheet stays available so you can create the other one later."
- Toast after finalize: "MR OA finalized. The cost sheet is still available to create a GMS OA from the Cost Sheets list."

## Files to edit

- `src/pages/orders/NewOrderChooser.tsx` — add format-choice step.
- `src/pages/orders/OrderEditor.tsx` — read `forcedFormat`, filter items + charges accordingly.
- `src/components/orders/CostSheetPicker.tsx` — show "MR OA / GMS OA" status badges per sheet.

No new files, no migrations, no edge-function changes.

## Out of scope

- Changing how AI extraction tags items (`inferItemMake` stays as-is).
- Multi-tenant / cross-user sharing of cost sheets.
- Removing the legacy single-OA split-mode (kept for backward compat with already-saved mixed OAs).

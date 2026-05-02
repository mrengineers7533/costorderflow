# Independent charges per format (MR vs GMS) — always

## Problem

Today the editor keeps two separate charge slots (`chargesMr`, `chargesGms`) but only routes between them when the OA contains **both** MR and GMS items (`splitMode = hasMR && hasGMS`). For a single-make OA — or while you're still building one — switching the Format dropdown reuses the MR slot for both, so a P&F % typed under MR also shows up under GMS, and vice-versa. The same bleed affects every other input (Insurance %, Sea Freight %, Custom %, Clearing %, GST %, Discount, EXW-Murthal/Turkey panels, currency, FX, advance %, hike, etc.).

## Goal

Whenever the user toggles the **Format** dropdown (MR ⇄ GMS), the entire charges & totals area — including the Ex-works Murthal (Landed Cost) panel, EXW-Turkey panel, and currency/FX/advance fields — must show **only that format's own values**. Editing any field on one side never affects the other side. This applies to every OA, regardless of whether it has one make or both.

## Changes

### 1. Drop the `splitMode` gate on charges routing
**`src/pages/orders/OrderEditor.tsx`**
- Change the active-charges proxy from `splitMode && format === "GMS"` to simply `format === "GMS"`. So:
  - `charges = format === "GMS" ? chargesGms : chargesMr`
  - `setCharges` always writes to `chargesGms` when format is GMS, otherwise `chargesMr`.
- The keyboard / UI bindings already use the proxied `charges` / `setCharges`, so every input listed below automatically becomes per-format:
  - **Charges & Totals column**: P&F %, P&F Amount, Insurance %, Insurance Amount, Freight toggle + amount, GST %, Apply discount toggle + label + Discount % + Discount Amount.
  - **GMS Mode selector** (None / EXW-Turkey / EXW-Murthal) and all its derived defaults.
  - **EXW-Turkey panel**: Sea Freight (toggle / mode / amount / % / base), Insurance (same), Custom (toggle / base / %), Local Freight (toggle / mode / amount / % / base), GST, One-time Discount.
  - **Ex-works Murthal panel**: Hike, P&F (toggle + %), Sea Freight % (of Basic), Sea Insurance %, Custom %, Clearing %, Landed GST %, Landed Discount.
  - **Currency block**: currency, currency_symbol, fx_rate, advance_percent.
- `totals` already derives from the proxied `charges`; it stays correct.

### 2. Persist both slots, always
- Save payload (insert + update + revision snapshot) currently writes `charges_gms: splitMode ? chargesGms : null`. Change to always persist both: `charges: chargesMr`, `charges_gms: chargesGms`.
- `snapshotOrder` likewise stores both.

### 3. Load both slots, always
- On load, hydrate `chargesMr` from `row.charges` and `chargesGms` from `row.charges_gms`. If `row.charges_gms` is null (legacy rows), seed `chargesGms` from defaults (NOT from `row.charges`) so a legacy MR-only OA doesn't pre-fill GMS with MR's values. This is the key fix vs. today's `o.charges_gms || o.charges` fallback.

### 4. PDF download uses the format's own charges
- `downloadPDF` already passes `format === "MR" ? chargesMr : chargesGms` per side in split mode, and uses `chargesMr` for the single-make path. Change the single-make path to use the active-format slot too: MR PDF → `chargesMr`, GMS PDF → `chargesGms`.

### 5. Defaults for the second slot
**`src/lib/orders/defaults.ts`** — no change. Both slots initialise from the existing `emptyCharges` factory.

### 6. Database
- No schema change. `orders.charges_gms` already exists. We will start writing it for every OA (not just mixed ones); the column stays nullable so older rows continue to load fine.

## Out of scope
- PI editor (single-format).
- BOQ editor.
- Auto-detect / `detectFormat` heuristic.
- The visual layout of the Charges & Totals / EXW panels — they keep their current controls; only the binding behind them changes.
- Line items continue to be shared (one item list with `make` tags); only **charges** are split per format.

## Files to edit
- `src/pages/orders/OrderEditor.tsx` (proxy, load, save, snapshot, downloadPDF)

## Acceptance
- Brand-new OA, Format=MR, type P&F % = 1. Switch Format → GMS. P&F % field is empty (or its own GMS value). Type P&F % = 2. Switch back to MR → still 1. Switch to GMS → still 2.
- Same independence for Insurance %, Freight, GST %, Discount, Sea Freight %, Sea Insurance %, Custom %, Clearing %, Landed GST %, Landed Discount, Hike, EXW-Turkey rows, currency / FX / advance %.
- Save the OA, reload it: both MR and GMS values restored exactly as entered.
- Mixed-make OAs continue to work (already worked before this change).
- Legacy single-make OAs (where `charges_gms` is null in DB) load with their original `charges` on the MR side and an empty GMS side — no surprise pre-fill.

# Fix: RM Master Excel parser is picking the wrong columns for Size and Qty

## What the data shows

Querying `fg_raw_material_map` for the FGs visible in the screenshot (e.g. `CYCLONE DIA 1500MM COMPLETE`, `ASPIRATION CHANNEL`) shows the same broken pattern every time:

- Row 1 has `size_model: "1"` and `qty_per_unit: 1`.
- Rows 2..N have no `size_model` and `qty_per_unit: 0`.
- `material` and `unit` are correct on every row.

Compared to the BOM screenshot (`MS SHEET | 1250X2500X2MM | 7.00 | NOS`, …), the parser is clearly:

1. Reading the **wrong column** for `Size / Model` — it's picking up a `Sr No` / item-number-like column whose first cell is `"1"`, not the column with `1250X2500X2MM`.
2. Reading the **wrong column** for `Qty / unit` — it's picking up the same kind of column (value `1`), not the column with `7`.
3. The last RM Master upload (`BOM 04 Jun. RECEIVE DATA FROM AMIT SIR FACTORY.xlsx`, 25 FGs, 565 rows) is the only one on file. Re-uploading after the previous parser patch will not help until the parser is corrected for this workbook's header layout.

The Excel file itself is not retained in storage, so we cannot inspect its exact header row from the sandbox — we need it once to lock the fix in.

## Why the current detection fails

Inside `src/pages/RawMaterialMaster.tsx → parseSheet`:

```ts
const cSize = headers.findIndex(h => h.includes("size") || h.includes("model"));
const cQtyPerUnit = headers.findIndex(h => h.includes("qty"));
const cReqd = headers.findIndex(h => h.includes("reqd") || h.includes("required"));
```

- `h.includes("model")` matches any column whose header has `Model` in it (e.g. `Model No`, `Sr/Model`, etc.), which can sit to the **left** of the real `Size / Model` column. `findIndex` returns the first match, so the Size column is mis-picked.
- `h.includes("qty")` matches the **first** header containing `qty` (e.g. `Sr / Qty`, `Qty Note`), again not necessarily the real `Qty / unit` column.
- The previous "merged-cell carry-forward" then propagates the wrong value, which is why row 1 has a stray `1` and the others are blank.

## Plan

### Step 1 — Get the actual workbook once

Ask the user to re-upload `BOM 04 Jun. …xlsx` to the chat (one-time, just so the headers can be inspected). Without seeing the real header row we cannot be sure which column variants exist and we risk re-introducing the same bug.

While waiting, the parser fix below is written defensively against the patterns we already see.

### Step 2 — Tighten header detection (file: `src/pages/RawMaterialMaster.tsx`, function `parseSheet`)

1. Treat the FG block columns as **positional from the `Raw Material` column**, not by fuzzy header search:
   - `cMat` stays as the column whose header matches `raw material`.
   - `cSize = cMat + 1` only if that header contains `size` (case-insensitive). If not, fall back to a strict header match for `size / model`, `size/model`, `size`, or a header that contains both `size` AND `model`. Never match on `model` alone.
   - `cQty` = the first column **after `cMat`** whose header contains `qty` (e.g. `qty / unit`, `qty/unit`, `qty per unit`, `qty`). Ignore any `qty` headers that sit **before** `cMat`.
   - `cReqd` = the first column **after `cMat`** whose header contains `reqd` or `required`.
   - `cUnit` = column whose header is exactly `unit` (or starts with `unit`) and sits **after `cMat`**.
   - `cMake` = column whose header is `make` and sits **before `cMat`** (Make conventionally precedes Material).
2. Compute `qty_per_unit` as the first finite non-zero value in `[row[cQty], row[cReqd]]`; if both are 0/empty, store `0` (today's behaviour).
3. **Remove the Size carry-forward** introduced previously. The current data proves it spreads the wrong value when the column itself is mis-detected; we'd rather have a blank than a wrong `"1"`. If the user's Excel genuinely uses merged Size cells we can reintroduce a narrower carry-forward (only when `sizeRaw` is non-empty for the first row of the FG block and the spreadsheet has no other text in the Size column for sibling rows), but only after seeing the file.
4. Add a one-time `console.info` of the detected column indices and the header row when parsing each sheet, so the next upload makes any further mis-detection obvious in DevTools. No UI change.

### Step 3 — Re-upload and verify

After the patch lands the admin must re-upload the same BOM Excel from `Raw Material Master`. Then:

1. Open `Raw Material Master → CYCLONE DIA 950MM COMPLETE` (or whichever FG corresponds to "Aspiration Cyclone - MRAC-15"). Size/Model and Qty match the BOM screenshot.
2. Manufacturing → Requisition → Manual select → `Search RM Master` → pick the same FG. Rows auto-fill Material, Size/Model, Qty/unit, Unit exactly as in the BOM. `Reqd` recomputes from `Qty/unit × FG quantity`.
3. Spot-check 2–3 other FGs (`ASPIRATION CHANNEL`, `BUCKET ELEVATOR MRE-200MM`) to confirm no regression.

## Out of scope (unchanged)

- `CreateRequisitionDialog.tsx`, `create-requisition` edge function, requisition PDF, public requisition view.
- DB schema, RLS, edge functions, Direct Purchase flow, Make column toggle.
- The on-screen BOQ grid, OA, PI, PDFs, calculations.

## What I need from you

Please attach the exact `BOM 04 Jun. …xlsx` you uploaded so I can confirm the header row text before I commit to Step 2's column rules — that's the only way to guarantee the fix matches your sheet on the first try.

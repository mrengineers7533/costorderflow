## Diagnosis

Inspected the uploaded `Final Upload BOM Requisition 09 Jun.xlsx`:

```
Row 0 headers: Sr. No. | S.N | Finished Good | Qty./ Size | UOM | Raw Material | Size/Model | Reqd Qty | Unit | PARTY NAME | REMARKS
Row 1:        (blank) | 1   | SCREW CONVEYOR SIZE-250MM | 1mtr. | Length | MS SHEET | 1250X2500X3MM | 0.5108 | NOS | ...
```

The header row IS being detected correctly. The real bug:

`parseSheet()` in `src/pages/RawMaterialMaster.tsx` hardcodes `const cFg = 0;` — i.e. it assumes the Finished Good name is always in Column A. In this file Column A is "Sr. No." (mostly empty) and the Finished Good column is **Column C**. Result: no non-empty FG cell is ever found → no groups created → "No rows parsed".

## Fix (single file)

`src/pages/RawMaterialMaster.tsx` → `parseSheet()` only.

1. **Detect FG column from header** instead of hardcoding 0. Search the detected header row for the first cell matching any of:
   - `finished good`, `finish good`, `finished goods`
   - `fg`, `fg name`, `fg description`
   - `model`, `model number`, `model no`, `product`
   Pick the **leftmost** match. Must lie to the **left of** the Material column (`< cMat`) so it can't accidentally pick "Size/Model".
2. **Fallback** (preserves old behaviour for legacy files where Column A is the FG): if no FG header is found, use `cFg = 0`.
3. Keep all other behaviour identical — Column-A-or-cFg drives grouping via the same loop; `firstLine()` model-key, qty fallback, make/size/unit resolution, upsert, upload history, toasts all unchanged.
4. Update the diagnostic `console.info("[RM parser] headers:", …)` to also log the resolved `cFg`.

## Acceptance

- `Final Upload BOM Requisition 09 Jun.xlsx` imports successfully — many FGs (one per distinct value in the "Finished Good" column), each with its raw-material rows grouped underneath.
- Previously-working file `BOM 04 Jun. RECEIVE DATA FROM AMIT SIR FACTORY.xlsx` still imports the same 24 FG / 565 RM rows (its FG column IS Column A → fallback kicks in OR header text matches, both paths work).
- All other flows on `/raw-materials` (view, edit, delete, upload history, admin gate) untouched.

No DB / schema / other-file changes.

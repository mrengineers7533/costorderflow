## Goal
Raw Material Master "CSV import" button par user ek se zyada Excel (.xlsx/.xls) files select kar sake. Existing single-file flow, validation, grouping, aur upsert logic same rahega — sirf file picker `multiple` ho jayega aur har file ko loop me same importer se process kiya jayega.

## Scope (only this)
- File: `src/pages/admin/AdminRawMaterials.tsx`
- Add `xlsx` (SheetJS) dependency for parsing `.xlsx` / `.xls` to rows.
- Button label aur `accept` update: `.csv,.xlsx,.xls` + `multiple`.
- New helper `parseFileToCsvText(file)`:
  - `.csv` → existing `file.text()` path (unchanged behavior).
  - `.xlsx` / `.xls` → first sheet → `XLSX.utils.sheet_to_csv(...)` → same CSV text string.
- Existing `importCsv(file)` body becomes `importOne(csvText)` (zero changes to parsing/validation/grouping/upsert/toast logic). `importCsv` wrapper still works for single CSV path so nothing else breaks.
- New `importFiles(files: File[])`:
  - For each file (in order): parse → call `importOne(csvText)`.
  - Per-file error toast uses existing error message; success toast existing format.
  - At end: one summary toast `Imported N file(s)`.
  - Single `load()` at the end.

## What stays unchanged
- `model_number` requirement, header detection, `is_direct_purchase` parsing, raw_materials grouping, `upsert(..., { onConflict: "model_number" })`, all existing toasts on validation failure, table/edit sheet UI, save/delete, RLS, schema.

## Acceptance
- Single `.csv` upload → identical behavior.
- Single `.xlsx` upload → parsed and imported via same logic.
- Multiple files selected at once → each processed; summary toast shows count; list reloads once.
- Any file failing validation shows its existing toast, but remaining files still process.

## Technical
- `bun add xlsx`
- Import: `import * as XLSX from "xlsx";`
- xlsx parse: `const wb = XLSX.read(await file.arrayBuffer(), { type: "array" }); const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);`

No DB migrations, no other files touched.
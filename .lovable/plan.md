## Diagnosis

Items ARE being parsed and inserted (verified in DB: REQ/GEN/26-27/0001 has 20 rows in `requisition_items`). The real bug is in `RequisitionDetail.tsx`:

- It calls `supabase.from("boqs").select("*").eq("id", r.boq_id)` with `boq_id = null` → no BOQ loads → header reads `boq.client_name` (works, optional chained) but the default tab is **"Generated"** (raw-materials view) which is empty for general requisitions. Users see "No raw materials generated." and assume the upload failed. The Machine List tab (which actually shows the parsed Excel rows) is hidden behind a tab click.
- The header also shows `BOQ R0` / `OA —` / `BOQ —`, which is meaningless for general requisitions and obscures the `title`.
- The "PDF (Generated)" button + stale-BOQ banner have no meaning for general requisitions.
- The Excel template is also missing the user-requested columns `Required Date` and `Purpose / Department`.

## Fix (UI + template only — no schema changes, no changes to project/OA flow)

### 1. `src/lib/requisition/uploadTemplate.ts`
Extend headers to:
`S.No | Item Description | Make | Size / Model | Material | Qty | Unit | Required Date | Purpose / Department | Remarks`
Update the sample row and the Instructions sheet wording.

### 2. `src/lib/requisition/parseUpload.ts`
Add two optional fields on `ParsedRequisitionItem`: `required_date`, `purpose`. Map them with the same `pick()` helper (aliases: `Required Date`, `Need By`, `Purpose`, `Department`, `Purpose / Department`).

### 3. `src/pages/requisitions/RequisitionsList.tsx` (general branch only)
When building `requisition_items` rows, fold the two new fields into the existing `remarks` string (no schema change):
`Make: … · Material: … · Required: <date> · For: <dept> · <remarks>`.
`fg_snapshot` already stores the full parsed object so nothing is lost. Project/OA branches untouched.

### 4. `src/pages/requisitions/RequisitionDetail.tsx`
Detect `isGeneral = req.kind === 'general'` (read via cast since `RequisitionRecord` may not yet expose it).
- Skip the `boqs` and `orders` queries when `r.boq_id` is null (guard with `if (r.boq_id)`).
- When `isGeneral`:
  - Header subtitle becomes: `<title> · <client_name_override or "—">` — hide OA/BOQ chips and the `BOQ R{n}` badge.
  - Hide the stale-BOQ badge, "Regenerate" button, and "PDF (Generated)" button. Keep "PDF" and "Delete".
  - Render only the **Machine List** view (no Tabs wrapper) using the existing items table, with the columns: `# | Description | Qty | Unit | Remarks`. Skip the Lot / Category / Make controls and the Steel/Outside/Raw/Generated tabs entirely.
- Project requisitions render exactly as today.

### 5. Out of scope
No migrations. No changes to PR/PO/GRN/CS/OA/BOQ/PI/PDF generation. Existing project + OA upload branches and their detail rendering are not touched.

## Files touched
```text
src/lib/requisition/uploadTemplate.ts
src/lib/requisition/parseUpload.ts
src/pages/requisitions/RequisitionsList.tsx   (general submit branch only)
src/pages/requisitions/RequisitionDetail.tsx  (conditional render for kind='general')
```

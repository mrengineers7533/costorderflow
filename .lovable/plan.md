## Add Excel + PDF download for the selected Design Review round

Add two buttons inside the open-round details box in `DesignReviewPanel.tsx` (next to "Copy Review Link"): **Download Excel** and **Download PDF**. Both export the round currently open in the panel — items + Design comments per column + decisions — so the BOQ creator can use it offline to update the BOQ.

### Contents of the export

For the selected round, include:

- Header: BOQ number, client, project, round number, kind (Comment/Approval), sent/submitted timestamps, reviewer name / team / contact.
- Items table, one row per BOQ item:
  - `#`, Model, Description, Qty, Unit, Remarks (the BOQ values at the moment the link was generated).
  - Decision (Pending / Approved / Change Required) — only meaningful for Approval rounds.
  - Design comments split per column: Model, Description, Qty, Unit, Remarks (sourced from `parseColumnComments(it)`).
  - Design change note (Approval rounds only).
  - Attached file names (joined).

### Files touched

- New `src/lib/boq/designReviewExport.ts` — two functions:
  - `exportDesignReviewRoundExcel(round, items, docs, boq)` — uses `xlsx` (already a transitive dep via project? if not, use `exceljs`/`xlsx` — check first, install if needed).
  - `exportDesignReviewRoundPDF(round, items, docs, boq)` — uses `jspdf` + `jspdf-autotable` (already used by `src/lib/boq/pdf.ts`).
- `src/components/boqs/DesignReviewPanel.tsx` — add two `Button`s in the open-round header bar; wire to the new helpers; show toast on success/failure.

### Technical notes

- Reuse `parseColumnComments` from `@/lib/boq/designReview` to split a comment into Model/Description/Qty/Unit/Remarks columns.
- File name pattern: `<BOQ-number>_R<round>_<Comment|Approval>.xlsx` / `.pdf` (slashes in BOQ number replaced with `_`).
- No DB changes, no API changes, no permission changes.
- Buttons appear only when a round is open (same condition as "Copy Review Link").

### Out of scope

- No bulk "download all rounds" export.
- No changes to OA, BOQ calc, or revision logic.

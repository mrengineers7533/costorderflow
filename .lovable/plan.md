## BOQ Print Page Column Auto-Fit

### Goal
Make BOQ print / PDF columns auto-fit to their content instead of using fixed widths.

### Files to change

1. **`src/lib/boq/pdf.ts`** (PDF generation via jspdf-autotable)
2. **`src/pages/boqs/BoqEditor.tsx`** — `BoqDocPreview` HTML print preview component

### Changes

#### 1. PDF — `src/lib/boq/pdf.ts`
In the `autoTable` call, replace all hardcoded `cellWidth` values in `columnStyles` with `"auto"`.
Keep `halign` and `fontStyle` as-is.

```diff
- columnStyles[ci++] = { cellWidth: showMake ? 14 : 16, halign: "center" };
+ columnStyles[ci++] = { cellWidth: "auto", halign: "center" };
```

Repeat for every `columnStyles[ci++]` assignment (MODEL NUMBER, DESCRIPTION, MAKE, MOTOR, MOTOR QTY, QTY, UNIT, Remarks, Approved by Design).

#### 2. HTML print preview — `BoqDocPreview` in `BoqEditor.tsx`
- Remove the `<colgroup>` block entirely.
- Change `tableLayout: "fixed"` to `tableLayout: "auto"`.
- Let the browser auto-size each column based on header + cell content.

```diff
- <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "4mm", fontSize: "8.5pt", tableLayout: "fixed" }}>
-   <colgroup>…fixed mm widths…</colgroup>
+ <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "4mm", fontSize: "8.5pt", tableLayout: "auto" }}>
```

### Out of scope
- No changes to approval status display logic, calculations, workflows, notifications, or any other print/PDF behavior.
- No changes to OA, PI, Requisition, or other document PDFs.
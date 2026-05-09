import * as XLSX from "xlsx";
import type { BoqRecord } from "./types";

/** Build a simple .xlsx workbook (as a Blob) for a BOQ revision.
 *  Pricing is intentionally omitted — BOQ has no rates, only the 6
 *  visible columns (item / model / description / qty / unit / remarks). */
export function buildBoqXlsx(b: BoqRecord): Blob {
  const header: (string | number)[][] = [
    [`BOQ No.: ${b.boq_number}`],
    [`Revision: R${b.revision ?? 0}${b.is_current ? " (Current)" : " (Superseded)"}`],
    [`Reference OA: ${b.reference_oa_number || ""}`],
    [`Customer: ${b.client_name || ""}`],
    [`Project / Cost Sheet No.: ${b.project_number || ""}`],
    [`Date: ${b.boq_date || ""}`],
    [`Prepared By: ${b.prepared_by || ""}`],
    [],
    ["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "QTY", "UNIT", "Remarks"],
  ];
  const body = (b.line_items || []).map((it, i) => [
    it.item_no || String(i + 1),
    it.model_number || "",
    it.description || "",
    Number(it.quantity) || 0,
    it.unit || "",
    it.remarks || "",
  ]);
  const tail: (string | number)[][] = [];
  if (b.terms && b.terms.trim()) {
    tail.push([], ["TERMS & CONDITIONS:"], [b.terms]);
  }
  if (b.notes && b.notes.trim()) {
    tail.push([], ["Notes:"], [b.notes]);
  }
  const ws = XLSX.utils.aoa_to_sheet([...header, ...body, ...tail]);
  ws["!cols"] = [
    { wch: 10 }, { wch: 24 }, { wch: 60 }, { wch: 8 }, { wch: 8 }, { wch: 40 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
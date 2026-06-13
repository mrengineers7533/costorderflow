import * as XLSX from "xlsx";
import { sortByItemNo, type BoqRecord } from "./types";

/** Build a simple .xlsx workbook (as a Blob) for a BOQ revision.
 *  Pricing is intentionally omitted — BOQ has no rates. The optional
 *  "Make" column is only included when `opts.showMake === true`, so the
 *  default export stays byte-identical to the historical workbook. */
export function buildBoqXlsx(b: BoqRecord, opts: { showMake?: boolean } = {}): Blob {
  const showMake = !!opts.showMake;
  const hasMotor = (b.line_items || []).some((it) => {
    const x = it as { motor?: string; motor_quantity?: number; motor_price?: number };
    return (x.motor && x.motor.trim()) || (x.motor_quantity ?? 0) > 0 || (x.motor_price ?? 0) > 0;
  });
  const baseHeader = showMake
    ? ["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "MAKE", "QTY", "UNIT", "Remarks"]
    : ["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "QTY", "UNIT", "Remarks"];
  if (hasMotor) baseHeader.push("MOTOR", "MOTOR QTY", "MOTOR PRICE");
  const header: (string | number)[][] = [
    [`BOQ No.: ${b.boq_number}`],
    [`Revision: R${b.revision ?? 0}${b.is_current ? " (Current)" : " (Superseded)"}`],
    [`Reference OA: ${b.reference_oa_number || ""}`],
    [`Customer: ${b.client_name || ""}`],
    [`Project / Cost Sheet No.: ${b.project_number || ""}`],
    [`Date: ${b.boq_date || ""}`],
    [`Prepared By: ${b.prepared_by || ""}`],
    [],
    baseHeader,
  ];
  const body = (b.line_items || []).map((it, i) => {
    const base: (string | number)[] = [
      it.item_no || String(i + 1),
      it.model_number || "",
      it.description || "",
      Number(it.quantity) || 0,
      it.unit || "",
      it.remarks || "",
    ];
    if (showMake) base.splice(3, 0, (it.make || "").trim());
    if (hasMotor) {
      const x = it as { motor?: string; motor_quantity?: number; motor_price?: number };
      base.push(
        (x.motor || "").trim(),
        x.motor_quantity != null ? Number(x.motor_quantity) : "",
        x.motor_price != null ? Number(x.motor_price) : "",
      );
    }
    return base;
  });
  const tail: (string | number)[][] = [];
  if (b.terms && b.terms.trim()) {
    tail.push([], ["TERMS & CONDITIONS:"], [b.terms]);
  }
  if (b.notes && b.notes.trim()) {
    tail.push([], ["Notes:"], [b.notes]);
  }
  const ws = XLSX.utils.aoa_to_sheet([...header, ...body, ...tail]);
  const baseCols = showMake
    ? [{ wch: 10 }, { wch: 24 }, { wch: 60 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 40 }]
    : [{ wch: 10 }, { wch: 24 }, { wch: 60 }, { wch: 8 }, { wch: 8 }, { wch: 40 }];
  if (hasMotor) baseCols.push({ wch: 24 }, { wch: 10 }, { wch: 14 });
  ws["!cols"] = baseCols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
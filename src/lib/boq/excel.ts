import * as XLSX from "xlsx";
import { sortByItemNo, type BoqRecord } from "./types";

/** Build a simple .xlsx workbook (as a Blob) for a BOQ revision.
 *  Pricing is intentionally omitted — BOQ has no rates. The optional
 *  "Make" column is only included when `opts.showMake === true`, so the
 *  default export stays byte-identical to the historical workbook. */
export function buildBoqXlsx(
  b: BoqRecord,
  opts: { showMake?: boolean; showMotor?: boolean } = {},
): Blob {
  const showMake = !!opts.showMake;
  const showMotor = opts.showMotor !== false;
  // Toggle is the single source of truth — columns always render when ON.
  const hasMotor = showMotor;
  const baseHeader: string[] = ["ITEM No.", "MODEL NUMBER", "DESCRIPTION"];
  if (showMake) baseHeader.push("MAKE");
  if (hasMotor) baseHeader.push("MOTOR", "MOTOR QTY");
  baseHeader.push("QTY", "UNIT", "Remarks");
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
    ];
    if (showMake) base.push((it.make || "").trim());
    if (hasMotor) {
      const x = it as { motor?: string; motor_quantity?: number };
      base.push(
        (x.motor || "").trim(),
        x.motor_quantity != null ? Number(x.motor_quantity) : "",
      );
    }
    base.push(
      Number(it.quantity) || 0,
      it.unit || "",
      it.remarks || "",
    );
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
  const baseCols: { wch: number }[] = [{ wch: 10 }, { wch: 24 }, { wch: 60 }];
  if (showMake) baseCols.push({ wch: 18 });
  if (hasMotor) baseCols.push({ wch: 24 }, { wch: 10 });
  baseCols.push({ wch: 8 }, { wch: 8 }, { wch: 40 });
  ws["!cols"] = baseCols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
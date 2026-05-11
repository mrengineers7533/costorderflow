import * as XLSX from "xlsx";
import type { OrderRecord } from "./types";
import { displayMake } from "./calc";

/** Build a simple .xlsx workbook (as a Blob) for an OA revision.
 *  Mirrors the layout used by the Client Copy Excel — header meta + items
 *  + key totals — so users can download an Excel for any saved OA version. */
export function buildOrderXlsx(o: OrderRecord): Blob {
  const t = o.totals || ({} as OrderRecord["totals"]);
  const header: (string | number)[][] = [
    [`OA No.: ${o.oa_number}`],
    [`Format: ${o.format}    Revision: R${o.revision ?? 0}${o.is_current ? " (Current)" : " (Superseded)"}`],
    [`Customer: ${o.company_name || o.bill_to?.name || ""}`],
    [`Date: ${o.order_date || ""}`],
    [`Prepared By: ${o.prepared_by || ""}`],
    [],
    ["S.No", "Description", "Make", "Qty", "Unit", "Rate (₹)", "Amount (₹)"],
  ];
  const body = (o.line_items || []).map((it, i) => [
    i + 1,
    it.description || "",
    displayMake(it),
    Number(it.quantity) || 0,
    it.unit || "",
    Number(it.unit_rate) || 0,
    Number(it.amount) || 0,
  ]);
  const tail: (string | number)[][] = [
    [],
    ["", "", "", "", "", "Basic Total ₹", Number(t.basic_total) || 0],
    ["", "", "", "", "", "Subtotal ₹", Number(t.subtotal) || 0],
    ["", "", "", "", "", "Grand Total ₹", Number(t.grand_total) || 0],
    ["", "", "", "", "", "Net Payable ₹", Number(t.net_payable) || 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...header, ...body, ...tail]);
  ws["!cols"] = [
    { wch: 6 }, { wch: 50 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "OA");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
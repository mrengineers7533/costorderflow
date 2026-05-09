import * as XLSX from "xlsx";
import type { LineItem, Totals, OrderFormat } from "./types";

export interface ClientCopySnapshotMeta {
  oa_number: string;
  format: OrderFormat;
  version_label: string;
  company_name?: string | null;
  order_date?: string | null;
}

/** Build an .xlsx workbook (as a Blob) from a saved Client Copy snapshot. */
export function buildClientCopyXlsx(
  meta: ClientCopySnapshotMeta,
  items: LineItem[],
  totals: Partial<Totals> | null | undefined,
): Blob {
  const header: (string | number)[][] = [
    [`OA: ${meta.oa_number}`],
    [`Format: ${meta.format}    Version: ${meta.version_label}`],
    [`Customer: ${meta.company_name || ""}`],
    [`Date: ${meta.order_date || ""}`],
    [],
    ["S.No", "Description", "HSN", "Qty", "Unit", "Rate", "Amount"],
  ];
  const body = items.map((it, i) => [
    i + 1,
    it.description || "",
    it.hsn_code || "",
    Number(it.quantity) || 0,
    it.unit || "",
    Number(it.unit_rate) || 0,
    Number(it.amount) || 0,
  ]);
  const t = totals || {};
  const tail: (string | number)[][] = [
    [],
    ["", "", "", "", "", "Basic Total", Number((t as Totals).basic_total) || 0],
    ["", "", "", "", "", "Subtotal", Number((t as Totals).subtotal) || 0],
    ["", "", "", "", "", "Grand Total", Number((t as Totals).grand_total) || 0],
    ["", "", "", "", "", "Net Payable", Number((t as Totals).net_payable) || 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...header, ...body, ...tail]);
  ws["!cols"] = [
    { wch: 6 }, { wch: 50 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Client Copy");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([arr], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
import * as XLSX from "xlsx";

export const REQUISITION_TEMPLATE_HEADERS = [
  "S.No",
  "Item Description",
  "Make",
  "Size / Model",
  "Material",
  "Qty",
  "Unit",
  "Required Date",
  "Purpose / Department",
  "Remarks",
] as const;

export function exportRequisitionTemplate() {
  const wb = XLSX.utils.book_new();

  const items = XLSX.utils.aoa_to_sheet([
    REQUISITION_TEMPLATE_HEADERS as unknown as string[],
    [1, "Sample Item — replace with your item", "ABB", "M16 x 60", "SS304", 10, "Nos", "2026-07-15", "Workshop", "Urgent"],
    [2, "", "", "", "", "", "", "", "", ""],
  ]);
  items["!cols"] = [
    { wch: 6 }, { wch: 40 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
    { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 22 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, items, "Requisition Items");

  const inst = XLSX.utils.aoa_to_sheet([
    ["Requisition Upload Template — Instructions"],
    [""],
    ["1. Use the 'Requisition Items' sheet to enter items, one per row."],
    ["2. Do NOT rename or reorder the header row."],
    ["3. Required columns: Item Description, Qty. Other columns are optional."],
    ["4. Qty must be a positive number. Unit examples: Nos, Kg, Mtr, Set."],
    ["5. Required Date can be YYYY-MM-DD or any date Excel recognises. Leave blank if not applicable."],
    ["6. Purpose / Department is free text (e.g. 'Workshop', 'Project Alpha')."],
    ["7. Save the file and upload it via the 'General' tab in the app."],
    ["8. Supported formats: .xlsx, .xls. (PDFs are stored as-is and not parsed.)"],
  ]);
  inst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, inst, "Instructions");

  XLSX.writeFile(wb, "Requisition_Template.xlsx");
}
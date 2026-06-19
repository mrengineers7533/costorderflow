import * as XLSX from "xlsx";

export const REQUISITION_TEMPLATE_HEADERS = [
  "Sr. No.",
  "Finished Good",
  "Quantity Finished Good",
  "UOM Finish Good",
  "Raw Material",
  "Raw Material Size/ Model",
  "Raw Material Reqd Qty",
  "Raw Material Unit",
  "PARTY NAME",
  "REMARKS",
  "LOT",
  "Raw Material Category",
] as const;

export function exportRequisitionTemplate() {
  const wb = XLSX.utils.book_new();

  // Sample shows the grouped layout: the Finished Good cells appear on
  // the FIRST row of the group; following raw-material rows leave the
  // FG cells blank and inherit the FG above.
  const items = XLSX.utils.aoa_to_sheet([
    REQUISITION_TEMPLATE_HEADERS as unknown as string[],
    [1, "HAMMER MILL-32'' WITH MOTOR", 1, "NOS", "MS SHEET", "1250X2500X8MM", 1.75, "NOS", "BOQ NO. — Sample", "", 1, "SHEET SS"],
    ["", "", "", "", "MS CHANNEL", "5''X2.5''X3MM", 3.36, "MTR", "", "", 1, "SHEET"],
    ["", "", "", "", "MS ANGLE", "32X3", 3.36, "MTR", "", "", 1, "SHEET"],
    [2, "Replace with next Finished Good", 1, "NOS", "Replace with first RM", "Size", 1, "NOS", "", "", 1, "PIPE"],
    ["", "", "", "", "Additional RM under FG #2", "Size", 2, "NOS", "", "", 1, "PIPE"],
  ]);
  items["!cols"] = [
    { wch: 7 },   // Sr. No.
    { wch: 36 },  // Finished Good
    { wch: 12 },  // Quantity Finished Good
    { wch: 10 },  // UOM Finish Good
    { wch: 22 },  // Raw Material
    { wch: 22 },  // Raw Material Size/ Model
    { wch: 12 },  // Raw Material Reqd Qty
    { wch: 10 },  // Raw Material Unit
    { wch: 22 },  // PARTY NAME
    { wch: 22 },  // REMARKS
    { wch: 6 },   // LOT
    { wch: 18 },  // Raw Material Category
  ];
  XLSX.utils.book_append_sheet(wb, items, "Requisition Items");

  const inst = XLSX.utils.aoa_to_sheet([
    ["Requisition Upload Template — Instructions"],
    [""],
    ["1. Use the 'Requisition Items' sheet. Do NOT rename or reorder the header row."],
    ["2. Each Finished Good (FG) starts a new group: fill Sr. No., Finished Good,"],
    ["   Quantity Finished Good and UOM Finish Good on the FIRST row of the group."],
    ["3. List each Raw Material on its own row BELOW the FG. Leave the FG columns"],
    ["   blank on those rows — they inherit the FG above until the next Sr. No./FG."],
    ["4. Required fields: Finished Good (per group), Raw Material, Raw Material Reqd Qty."],
    ["5. Raw Material Category should be one of: SHEET SS, SHEET MS, SHEET GI, SHEET,"],
    ["   PIPE, STEEL, STRUCTURE, MACHINE, 3P. Unknown values are kept as a note."],
    ["6. LOT groups raw materials for annexure/PO planning — same LOT + Category are"],
    ["   combined into one annexure row downstream."],
    ["7. PARTY NAME and REMARKS are free text and preserved as-is."],
    ["8. Supported formats: .xlsx, .xls. PDFs are stored as-is and not parsed."],
  ]);
  inst["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, inst, "Instructions");

  XLSX.writeFile(wb, "Requisition_Template.xlsx");
}
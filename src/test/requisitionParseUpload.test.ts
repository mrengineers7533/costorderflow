import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseGroupedRequisitionExcel,
  mapCategoryToPlanStatus,
} from "@/lib/requisition/parseUpload";

const HEADERS = [
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
];

function makeExcelFile(rows: unknown[][], headers: string[] = HEADERS, sheet = "Sheet1"): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  // jsdom's File doesn't implement arrayBuffer(); attach a shim so the
  // parser (which only needs file.arrayBuffer()) works in tests.
  const f = new File([buf], "req.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (typeof (f as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== "function") {
    (f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => buf;
  }
  return f;
}

describe("mapCategoryToPlanStatus", () => {
  it("maps known SHEET SS / PIPE / STEEL variants", () => {
    expect(mapCategoryToPlanStatus("SHEET SS")).toBe("sheet_ss");
    expect(mapCategoryToPlanStatus("ss sheet")).toBe("sheet_ss");
    expect(mapCategoryToPlanStatus("PIPE")).toBe("pipe");
    expect(mapCategoryToPlanStatus("Steel")).toBe("steel");
    expect(mapCategoryToPlanStatus("Structure")).toBe("structure");
    expect(mapCategoryToPlanStatus("3P")).toBe("3p");
    expect(mapCategoryToPlanStatus("Machine")).toBe("machine");
  });

  it("defaults bare SHEET to sheet_ms and handles GI/MS variants", () => {
    expect(mapCategoryToPlanStatus("SHEET")).toBe("sheet_ms");
    expect(mapCategoryToPlanStatus("MS SHEET")).toBe("sheet_ms");
    expect(mapCategoryToPlanStatus("gi sheet")).toBe("sheet_gi");
  });

  it("returns null for empty / unknown categories", () => {
    expect(mapCategoryToPlanStatus(null)).toBeNull();
    expect(mapCategoryToPlanStatus("")).toBeNull();
    expect(mapCategoryToPlanStatus("   ")).toBeNull();
    expect(mapCategoryToPlanStatus("Unicorn")).toBeNull();
  });
});

describe("parseGroupedRequisitionExcel", () => {
  it("forward-fills FG cells: blank FG rows attach to the previous group", async () => {
    const file = makeExcelFile([
      [1, "HAMMER MILL", 1, "NOS", "MS SHEET", "8MM", 1.75, "NOS", "ABB", "Urgent", 1, "SHEET SS"],
      ["", "", "", "", "MS CHANNEL", "5x2.5x3", 3.36, "MTR", "", "", 1, "SHEET"],
      ["", "", "", "", "MS ANGLE", "32x3", 3.36, "MTR", "", "", 1, "SHEET"],
      [2, "CRUSHER", 2, "NOS", "MS PLATE", "10MM", 5, "NOS", "Siemens", "", 2, "PIPE"],
    ]);
    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toHaveLength(2);

    expect(groups[0].s_no).toBe(1);
    expect(groups[0].fg_description).toBe("HAMMER MILL");
    expect(groups[0].fg_quantity).toBe(1);
    expect(groups[0].fg_unit).toBe("NOS");
    expect(groups[0].raw_materials).toHaveLength(3);
    expect(groups[0].raw_materials.map((r) => r.material)).toEqual([
      "MS SHEET", "MS CHANNEL", "MS ANGLE",
    ]);
    expect(groups[0].raw_materials[0].party_name).toBe("ABB");
    expect(groups[0].raw_materials[0].remarks).toBe("Urgent");
    expect(groups[0].raw_materials[0].lot).toBe("1");
    expect(groups[0].raw_materials[0].category).toBe("SHEET SS");
    expect(groups[0].raw_materials[0].qty).toBe(1.75);

    expect(groups[1].fg_description).toBe("CRUSHER");
    expect(groups[1].raw_materials).toHaveLength(1);
    expect(groups[1].raw_materials[0].material).toBe("MS PLATE");
    expect(groups[1].raw_materials[0].party_name).toBe("Siemens");
  });

  it("accepts the 'Raw Material Catagpry' typo header", async () => {
    const typoHeaders = [...HEADERS];
    typoHeaders[11] = "Raw Material Catagpry";
    const file = makeExcelFile(
      [
        [1, "WIDGET", 1, "NOS", "MS ROUND BAR", "12MM", 6.41, "MTR", "", "", 1, "SHEET"],
        ["", "", "", "", "MS FLAT", "32x5", 6, "MTR", "", "", 1, "PIPE"],
      ],
      typoHeaders,
    );
    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toHaveLength(1);
    expect(groups[0].raw_materials).toHaveLength(2);
    expect(groups[0].raw_materials[0].category).toBe("SHEET");
    expect(mapCategoryToPlanStatus(groups[0].raw_materials[0].category)).toBe("sheet_ms");
    expect(groups[0].raw_materials[1].category).toBe("PIPE");
    expect(mapCategoryToPlanStatus(groups[0].raw_materials[1].category)).toBe("pipe");
  });

  it("starts a new group whenever Sr.No or Finished Good is set", async () => {
    const file = makeExcelFile([
      [1, "FG A", 1, "NOS", "RM A1", "s", 1, "NOS", "", "", 1, "PIPE"],
      ["", "", "", "", "RM A2", "s", 2, "NOS", "", "", 1, "PIPE"],
      // Sr.No alone (no FG description) should still start a new group
      [2, "", "", "", "RM B1", "s", 3, "NOS", "", "", 1, "PIPE"],
      // Same group as #2 (blank Sr.No + blank FG)
      ["", "", "", "", "RM B2", "s", 4, "NOS", "", "", 1, "PIPE"],
    ]);
    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toHaveLength(2);
    expect(groups[0].raw_materials).toHaveLength(2);
    expect(groups[1].s_no).toBe(2);
    expect(groups[1].fg_description).toBe("");
    expect(groups[1].raw_materials.map((r) => r.material)).toEqual(["RM B1", "RM B2"]);
  });

  it("returns an empty list when the sheet has only headers", async () => {
    const file = makeExcelFile([]);
    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toEqual([]);
  });

  it("creates an '(Unassigned)' bucket for RM rows that appear before any FG", async () => {
    const file = makeExcelFile([
      ["", "", "", "", "ORPHAN RM", "x", 1, "NOS", "", "", 1, "PIPE"],
      [1, "REAL FG", 1, "NOS", "RM 1", "x", 1, "NOS", "", "", 1, "PIPE"],
    ]);
    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toHaveLength(2);
    expect(groups[0].fg_description).toBe("(Unassigned)");
    expect(groups[0].raw_materials[0].material).toBe("ORPHAN RM");
    expect(groups[1].fg_description).toBe("REAL FG");
  });
});
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseGroupedRequisitionExcel,
} from "@/lib/requisition/parseUpload";
import {
  buildUploadedRmInputs,
  buildBoqRequisitionRmInputs,
  consolidateRawMaterials,
  buildAnnexureRowInserts,
  computePoTotals,
  type RmInputRow,
} from "@/lib/requisition/annexurePipeline";

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

function makeExcelFile(rows: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const f = new File([buf], "req.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (typeof (f as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== "function") {
    (f as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => buf;
  }
  return f;
}

describe("annexurePipeline — uploaded requisition flow", () => {
  it("parsed Excel -> consolidated rows -> annexure rows -> PO totals", async () => {
    // Two FG groups; some RMs share material+lot+status to exercise grouping.
    const file = makeExcelFile([
      [1, "HAMMER MILL", 2, "NOS", "MS SHEET", "8MM", 1.75, "NOS", "ABB", "Urgent", 1, "SHEET SS"],
      ["", "", "", "", "MS SHEET", "8MM", 0.25, "NOS", "ABB", "Urgent", 1, "SHEET SS"], // merges with above
      ["", "", "", "", "MS ANGLE", "32X3", 3, "MTR", "", "", 1, "PIPE"],
      [2, "CRUSHER", 1, "NOS", "MS PLATE", "10MM", 5, "NOS", "Siemens", "", 2, "SHEET MS"],
      ["", "", "", "", "MS ANGLE", "32X3", 2, "MTR", "", "", 1, "PIPE"], // merges with row 3
    ]);

    const groups = await parseGroupedRequisitionExcel(file);
    expect(groups).toHaveLength(2);

    const rms = buildUploadedRmInputs(groups);
    expect(rms).toHaveLength(5);

    const consolidated = consolidateRawMaterials(rms);
    // 3 distinct (material+size+make+unit+lot+status) buckets
    expect(consolidated).toHaveLength(3);

    const sheetSs = consolidated.find((c) => c.plan_status === "sheet_ss")!;
    expect(sheetSs.total).toBe(2); // 1.75 + 0.25
    expect(sheetSs.lot_no).toBe("1");
    expect(sheetSs.make).toBe("ABB");

    const pipe = consolidated.find((c) => c.plan_status === "pipe")!;
    expect(pipe.total).toBe(5); // 3 + 2
    expect(pipe.lot_no).toBe("1");

    const sheetMs = consolidated.find((c) => c.plan_status === "sheet_ms")!;
    expect(sheetMs.total).toBe(5);
    expect(sheetMs.lot_no).toBe("2");

    const annexureRows = buildAnnexureRowInserts(consolidated);
    expect(annexureRows).toHaveLength(3);
    expect(annexureRows.every((r) => r.lot_no && r.plan_status && r.total_qty > 0)).toBe(true);
    expect(annexureRows.every((r) => r.source_rm_ids.length > 0)).toBe(true);

    // PO for the pipe lot only: rate 100, no discount, 18% GST -> 5 * 100 = 500 + 90
    const pipeAnnexure = annexureRows.filter((r) => r.lot_no === "1" && r.plan_status === "pipe");
    const totals = computePoTotals(pipeAnnexure, {
      "MS ANGLE": { rate: 100, discountPct: 0, gstPct: 18 },
    });
    expect(totals.lines).toHaveLength(1);
    expect(totals.totalQty).toBe(5);
    expect(totals.subtotal).toBeCloseTo(500, 5);
    expect(totals.taxTotal).toBeCloseTo(90, 5);
    expect(totals.grandTotal).toBeCloseTo(590, 5);
  });

  it("drops rows that have no lot or no plan_status from the annexure", async () => {
    const file = makeExcelFile([
      [1, "WIDGET", 1, "NOS", "RM A", "x", 5, "NOS", "", "", "", "PIPE"], // no lot
      ["", "", "", "", "RM B", "y", 3, "NOS", "", "", 1, ""],              // no category
      ["", "", "", "", "RM C", "z", 2, "NOS", "", "", 1, "PIPE"],          // good
    ]);
    const rms = buildUploadedRmInputs(await parseGroupedRequisitionExcel(file));
    const consolidated = consolidateRawMaterials(rms);
    expect(consolidated).toHaveLength(3);
    const annexureRows = buildAnnexureRowInserts(consolidated);
    expect(annexureRows).toHaveLength(1);
    expect(annexureRows[0].material).toBe("RM C");
  });
});

describe("annexurePipeline — BOQ-generated requisition flow", () => {
  it("BOQ line items + FG map -> RM rows -> annexure -> PO totals", () => {
    const lineItems = [
      { id: "li-1", model_number: "PUMP-100", quantity: 2 },
      { id: "li-2", model_number: "PUMP-100", quantity: 3 }, // same FG, different line
      { id: "li-3", model_number: "MOTOR-50", quantity: 1 },
      { id: "li-4", model_number: "DIRECT-FG", quantity: 9 }, // direct purchase -> skipped
      { id: "li-5", model_number: "UNKNOWN", quantity: 7 },   // no mapping -> skipped
    ];
    const fgMaps = [
      {
        model_number: "PUMP-100",
        is_direct_purchase: false,
        raw_materials: [
          { material: "MS SHEET", size_model: "5MM", make: "TATA", unit: "NOS", qty_per_unit: 0.5 },
          { material: "MS ROD",   size_model: "12MM", make: "JSW",  unit: "MTR", qty_per_unit: 1.2 },
        ],
      },
      {
        model_number: "MOTOR-50",
        is_direct_purchase: false,
        raw_materials: [
          { material: "MS SHEET", size_model: "5MM", make: "TATA", unit: "NOS", qty_per_unit: 0.4 },
        ],
      },
      { model_number: "DIRECT-FG", is_direct_purchase: true, raw_materials: [] },
    ];

    const rms = buildBoqRequisitionRmInputs(lineItems, fgMaps, {
      defaultLot: "1",
      defaultPlanStatus: "sheet_ms",
    });
    // 2 RMs per PUMP-100 line * 2 lines = 4, plus 1 RM for MOTOR-50 = 5 rows
    expect(rms).toHaveLength(5);

    // PUMP-100 totals: MS SHEET = 0.5 * 5 = 2.5, MS ROD = 1.2 * 5 = 6
    // MOTOR-50: MS SHEET 0.4 * 1 = 0.4
    // After consolidation MS SHEET = 2.5 + 0.4 = 2.9, MS ROD = 6
    const consolidated = consolidateRawMaterials(rms);
    const sheet = consolidated.find((c) => c.material === "MS SHEET")!;
    const rod = consolidated.find((c) => c.material === "MS ROD")!;
    expect(sheet.total).toBeCloseTo(2.9, 5);
    expect(rod.total).toBeCloseTo(6, 5);
    expect(sheet.sourceRmIds).toHaveLength(3); // 2 from PUMP lines + 1 from MOTOR

    const annexureRows = buildAnnexureRowInserts(consolidated);
    expect(annexureRows).toHaveLength(2);
    expect(annexureRows.every((r) => r.lot_no === "1" && r.plan_status === "sheet_ms")).toBe(true);

    // PO: rate 200 (sheet) and rate 50 (rod), GST 18%, 10% discount on sheet
    const totals = computePoTotals(annexureRows, {
      "MS SHEET": { rate: 200, discountPct: 10, gstPct: 18 },
      "MS ROD":   { rate: 50,  discountPct: 0,  gstPct: 18 },
    });
    expect(totals.lines).toHaveLength(2);
    // sheet basic = 2.9 * 200 * 0.9 = 522; gst = 93.96
    // rod basic   = 6 * 50 = 300;            gst = 54
    expect(totals.subtotal).toBeCloseTo(522 + 300, 5);
    expect(totals.taxTotal).toBeCloseTo(93.96 + 54, 5);
    expect(totals.grandTotal).toBeCloseTo(522 + 300 + 93.96 + 54, 5);
    expect(totals.totalQty).toBeCloseTo(2.9 + 6, 5);
  });

  it("yields the same annexure shape for an uploaded and a BOQ-generated requisition with equivalent RM data", () => {
    // Uploaded: one FG with one RM
    const uploadedRms: RmInputRow[] = [{
      id: "upl-1",
      material: "MS SHEET",
      size_model: "8MM",
      make: "TATA",
      unit: "NOS",
      lot_no: "1",
      plan_status: "sheet_ss",
      required_qty: 4,
    }];
    // BOQ generated: derived from a 2-unit FG with 2 MS SHEET per unit (= 4)
    const boqRms = buildBoqRequisitionRmInputs(
      [{ id: "li-1", model_number: "FG-1", quantity: 2 }],
      [{
        model_number: "FG-1",
        is_direct_purchase: false,
        raw_materials: [{ material: "MS SHEET", size_model: "8MM", make: "TATA", unit: "NOS", qty_per_unit: 2 }],
      }],
      { defaultLot: "1", defaultPlanStatus: "sheet_ss" },
    );

    const a = buildAnnexureRowInserts(consolidateRawMaterials(uploadedRms));
    const b = buildAnnexureRowInserts(consolidateRawMaterials(boqRms));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    // Compare everything except source ids (those identify the originating rows)
    const strip = (r: typeof a[number]) => ({ ...r, source_rm_ids: undefined });
    expect(strip(a[0])).toEqual(strip(b[0]));

    // Same PO totals from the same pricing
    const price = { "MS SHEET": { rate: 100, discountPct: 0, gstPct: 18 } };
    const ta = computePoTotals(a, price);
    const tb = computePoTotals(b, price);
    expect(ta.grandTotal).toBeCloseTo(tb.grandTotal, 5);
    expect(ta.totalQty).toBeCloseTo(tb.totalQty, 5);
  });
});
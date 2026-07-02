import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RequisitionRecord, RequisitionItemRecord, RequisitionRawMaterialRecord } from "./types";
import { withPdfTableDefaults } from "@/lib/pdf/tableStyles";

export interface RequisitionPdfContext {
  requisition: RequisitionRecord;
  items: RequisitionItemRecord[];
  rawMaterials?: RequisitionRawMaterialRecord[];
  boqNumber: string;
  oaNumber: string;
  clientName: string;
  shareLink: string;
  familyLink?: string;
  /** When true, inserts a "Make" column in the Raw Material Indent table.
   *  Defaults to false so the PDF stays byte-identical to today's output. */
  showMake?: boolean;
  /** Output format. "default" preserves the legacy two-table layout.
   *  "generated" emits the 10-column unified table requested by the user. */
  format?: "default" | "generated";
  generatedRows?: Array<{
    fgLabel: string; fgMake: string; fgQty: string;
    material: string; size: string; rmQty: string;
    rmMake: string; uom: string; lot: string; status: string;
    span: number; first: boolean;
  }>;
}

export function generateRequisitionPDF(ctx: RequisitionPdfContext): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: ctx.format === "generated" ? "a3" : "a4", orientation: ctx.format === "generated" ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("MATERIAL REQUISITION", W / 2, 16, { align: "center" });

  doc.setFont("helvetica", "normal").setFontSize(9);
  const headerLines = [
    `Requisition No: ${ctx.requisition.requisition_number}`,
    `BOQ: ${ctx.boqNumber}   Revision: R${ctx.requisition.boq_revision}`,
    `OA: ${ctx.oaNumber || "—"}`,
    `Client: ${ctx.clientName || "—"}`,
    `Date: ${new Date(ctx.requisition.created_at).toLocaleDateString("en-IN")}`,
    `Link (always-latest BOQ): ${ctx.familyLink || "—"}`,
    `Requisition link: ${ctx.shareLink}`,
  ];
  headerLines.forEach((line, idx) => doc.text(line, M, 24 + idx * 4.5));

  if (ctx.format === "generated") {
    const rows = ctx.generatedRows || [];
    const body: Array<Array<string | { content: string; rowSpan: number; styles?: Record<string, unknown> }>> = [];
    rows.forEach((r) => {
      const row: Array<string | { content: string; rowSpan: number; styles?: Record<string, unknown> }> = [];
      if (r.first) {
        row.push({ content: r.fgLabel, rowSpan: r.span, styles: { valign: "middle", fontStyle: "bold" } });
        row.push({ content: r.fgMake, rowSpan: r.span, styles: { valign: "middle" } });
        row.push({ content: r.fgQty, rowSpan: r.span, styles: { valign: "middle", halign: "right" } });
      }
      row.push(r.material);
      row.push(r.size);
      row.push(r.rmQty);
      row.push(r.rmMake);
      row.push(r.uom);
      row.push(r.lot || "—");
      row.push(r.status);
      body.push(row);
    });
    autoTable(doc, withPdfTableDefaults({
      startY: 24 + headerLines.length * 4.5 + 4,
      head: [["Finished Good", "Make", "Qty", "Raw Material", "Size", "RM Qty", "RM Make", "UOM", "Lot", "Status"]],
      body,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [55, 65, 81], textColor: 255 },
      margin: { left: M, right: M },
    }));
    return doc;
  }

  autoTable(doc, withPdfTableDefaults({
    startY: 24 + headerLines.length * 4.5 + 4,
    head: [["#", "Model", "Description", "Qty", "Unit", "Remarks"]],
    body: ctx.items.map((it) => [
      it.item_no ?? "",
      it.model_number ?? "",
      it.description ?? "",
      it.quantity == null ? "" : String(it.quantity),
      it.unit ?? "",
      it.remarks ?? "",
    ]),
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 32 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 16 },
      5: { cellWidth: 40 },
    },
    margin: { left: M, right: M },
  }));

  // @ts-expect-error lastAutoTable runtime
  const y = (doc.lastAutoTable?.finalY ?? 40) + 10;

  // Raw Material Indent section
  const rms = ctx.rawMaterials || [];
  if (rms.length) {
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("RAW MATERIAL INDENT", M, y);
    // Group RM rows by Finish Good
    const itemById = new Map(ctx.items.map((it) => [it.id, it] as const));
    const order: string[] = [];
    const buckets = new Map<string, typeof rms>();
    rms.forEach((r) => {
      const k = r.requisition_item_id || `__model__:${r.model_number || "—"}`;
      if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
      buckets.get(k)!.push(r);
    });
    const numKey = (s: string | null | undefined) => {
      const n = parseFloat(String(s ?? ""));
      return Number.isFinite(n) ? n : 9999;
    };
    order.sort((a, b) => numKey(itemById.get(a)?.item_no) - numKey(itemById.get(b)?.item_no));

    const showMake = !!ctx.showMake;
    const body: Array<Array<string | { content: string; rowSpan: number; styles?: Record<string, unknown> }>> = [];
    order.forEach((k) => {
      const list = buckets.get(k)!;
      const fg = itemById.get(k);
      const fgLabel = fg?.model_number || fg?.description || list[0].model_number || "—";
      list.forEach((r, idx) => {
        const row: Array<string | { content: string; rowSpan: number; styles?: Record<string, unknown> }> = [];
        if (idx === 0) {
          row.push({ content: fgLabel, rowSpan: list.length, styles: { valign: "middle", fontStyle: "bold" } });
        }
        row.push(r.material);
        if (showMake) row.push((r.make ?? "").toString() || "—");
        row.push(r.size_model ?? "—");
        row.push(r.required_qty != null ? String(r.required_qty) : "—");
        row.push(r.unit || "—");
        body.push(row);
      });
    });

    autoTable(doc, withPdfTableDefaults({
      startY: y + 2,
      head: [
        showMake
          ? ["Finished Good", "Raw Material", "Make", "Size / Spec", "Reqd Qty", "Unit"]
          : ["Finished Good", "Raw Material", "Size / Spec", "Reqd Qty", "Unit"],
      ],
      body,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [55, 65, 81], textColor: 255 },
      columnStyles: showMake
        ? {
            0: { cellWidth: 54 },
            1: { cellWidth: 36 },
            2: { cellWidth: 22 },
            3: { cellWidth: "auto" },
            4: { cellWidth: 20, halign: "right" },
            5: { cellWidth: 16 },
          }
        : {
            0: { cellWidth: 60 },
            1: { cellWidth: 40 },
            2: { cellWidth: "auto" },
            3: { cellWidth: 20, halign: "right" },
            4: { cellWidth: 16 },
          },
      margin: { left: M, right: M },
    }));
  }

  // @ts-expect-error lastAutoTable runtime
  const y2 = (doc.lastAutoTable?.finalY ?? y) + 8;
  doc.setFont("helvetica", "italic").setFontSize(8.5);
  doc.text("Direct-purchase Finish Good items are excluded from this requisition.", M, y2);
  doc.text(
    "This requisition links to the latest approved BOQ revision. Any future revisions update the source link automatically.",
    M, y2 + 4,
  );

  return doc;
}
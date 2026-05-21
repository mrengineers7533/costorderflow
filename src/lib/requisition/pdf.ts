import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { RequisitionRecord, RequisitionItemRecord, RequisitionRawMaterialRecord } from "./types";

export interface RequisitionPdfContext {
  requisition: RequisitionRecord;
  items: RequisitionItemRecord[];
  rawMaterials?: RequisitionRawMaterialRecord[];
  boqNumber: string;
  oaNumber: string;
  clientName: string;
  shareLink: string;
  familyLink?: string;
}

export function generateRequisitionPDF(ctx: RequisitionPdfContext): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
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

  autoTable(doc, {
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
  });

  // @ts-expect-error lastAutoTable runtime
  const y = (doc.lastAutoTable?.finalY ?? 40) + 10;

  // Raw Material Indent section
  const rms = ctx.rawMaterials || [];
  if (rms.length) {
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("RAW MATERIAL INDENT", M, y);
    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Make", "Raw Material", "Size / Model", "Reqd Qty", "Unit", "Status"]],
      body: rms.map((r, idx) => [
        String(idx + 1),
        r.make ?? "",
        r.material,
        r.size_model ?? "",
        r.required_qty != null ? String(r.required_qty) : "—",
        r.unit || "—",
        r.source === "unmapped_placeholder" ? "Mapping Not Found" : r.purchase_status,
      ]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2, valign: "top" },
      headStyles: { fillColor: [55, 65, 81], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 25 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 30 },
        4: { cellWidth: 18, halign: "right" },
        5: { cellWidth: 14 },
        6: { cellWidth: 24 },
      },
      margin: { left: M, right: M },
    });
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
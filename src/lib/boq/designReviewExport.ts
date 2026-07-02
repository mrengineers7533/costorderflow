import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { sortByItemNo } from "@/lib/boq/types";
import {
import { withPdfTableDefaults } from "@/lib/pdf/tableStyles";
  parseColumnComments,
  signedDocUrl,
  type DesignReviewRow,
  type DesignReviewItemRow,
  type DesignReviewDocRow,
} from "@/lib/boq/designReview";

export interface ExportBoqMeta {
  boq_number: string;
  client_name: string | null;
  project_number: string | null;
}

function fmt(dt?: string | null): string {
  if (!dt) return "";
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

function decisionLabel(d: string): string {
  if (d === "approved") return "Approved";
  if (d === "change_required") return "Change Required";
  return "Pending";
}

function safeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, "_");
}

function buildRows(round: DesignReviewRow, items: DesignReviewItemRow[], docs: DesignReviewDocRow[]) {
  const isApproval = round.kind === "approval";
  const docsByItem = docs.reduce<Record<string, DesignReviewDocRow[]>>((m, d) => {
    const k = d.boq_item_id || "_general";
    (m[k] ||= []).push(d); return m;
  }, {});
  return sortByItemNo(items).map((it) => {
    const cols = parseColumnComments(it);
    return {
      item_no: it.item_no || "",
      model: it.model_number || "",
      description: it.description || "",
      qty: it.quantity ?? 0,
      unit: it.unit || "",
      remarks: it.remarks || "",
      decision: isApproval ? decisionLabel(it.decision) : "",
      design_change_note: isApproval ? (it.design_change_note || "") : "",
      d_model: (cols.model || "").trim(),
      d_description: (cols.description || "").trim(),
      d_quantity: (cols.quantity || "").trim(),
      d_unit: (cols.unit || "").trim(),
      d_remarks: (cols.remarks || "").trim(),
      files: (docsByItem[it.boq_item_id] || []).map((d) => d.file_name).join(", "),
    };
  });
}

export function exportDesignReviewRoundExcel(
  round: DesignReviewRow,
  items: DesignReviewItemRow[],
  docs: DesignReviewDocRow[],
  boq: ExportBoqMeta,
): void {
  const isApproval = round.kind === "approval";
  const header: (string | number)[][] = [
    [`BOQ No.: ${boq.boq_number}`],
    [`Customer: ${boq.client_name || ""}`],
    [`Project / Cost Sheet No.: ${boq.project_number || ""}`],
    [`Design Review · Round R${round.round_no} · ${isApproval ? "Approval" : "Comment"}`],
    [`Sent: ${fmt(round.sent_at)}   Expires: ${fmt(round.expires_at)}`],
    [`Submitted: ${fmt(round.submitted_at)}   By: ${round.submitted_by_email || ""}`],
    [`Reviewer: ${round.reviewer_name || ""}   Team: ${round.reviewer_design_team || ""}   Contact: ${round.reviewer_contact || ""}`],
    [`Overall outcome: ${round.overall_outcome || "—"}`],
    [],
  ];
  const cols = [
    "#", "MODEL", "DESCRIPTION", "QTY", "UNIT", "REMARKS",
    ...(isApproval ? ["DECISION"] : []),
    "DESIGN · MODEL", "DESIGN · DESCRIPTION", "DESIGN · QTY", "DESIGN · UNIT", "DESIGN · REMARKS",
    ...(isApproval ? ["DESIGN · CHANGE NOTE"] : []),
    "FILES",
  ];
  const rows = buildRows(round, items, docs).map((r) => [
    r.item_no, r.model, r.description, r.qty, r.unit, r.remarks,
    ...(isApproval ? [r.decision] : []),
    r.d_model, r.d_description, r.d_quantity, r.d_unit, r.d_remarks,
    ...(isApproval ? [r.design_change_note] : []),
    r.files,
  ]);
  const aoa: (string | number)[][] = [...header, cols, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 }, { wch: 22 }, { wch: 50 }, { wch: 6 }, { wch: 6 }, { wch: 28 },
    ...(isApproval ? [{ wch: 16 }] : []),
    { wch: 22 }, { wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 28 },
    ...(isApproval ? [{ wch: 28 }] : []),
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `R${round.round_no}`);
  const fname = `${safeName(boq.boq_number || "BOQ")}_R${round.round_no}_${isApproval ? "Approval" : "Comment"}.xlsx`;
  XLSX.writeFile(wb, fname);
}

export async function exportDesignReviewRoundPDF(
  round: DesignReviewRow,
  items: DesignReviewItemRow[],
  docs: DesignReviewDocRow[],
  boq: ExportBoqMeta,
): Promise<void> {
  const isApproval = round.kind === "approval";
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`Design Review · R${round.round_no} · ${isApproval ? "Approval" : "Comment"}`, 32, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metaLines = [
    `BOQ No.: ${boq.boq_number}    Customer: ${boq.client_name || "—"}    Project: ${boq.project_number || "—"}`,
    `Sent: ${fmt(round.sent_at)}    Expires: ${fmt(round.expires_at)}    Submitted: ${fmt(round.submitted_at)}`,
    `Reviewer: ${round.reviewer_name || "—"}    Team: ${round.reviewer_design_team || "—"}    Contact: ${round.reviewer_contact || round.submitted_by_email || "—"}`,
    `Overall outcome: ${round.overall_outcome || "—"}`,
  ];
  metaLines.forEach((ln, i) => doc.text(ln, 32, 54 + i * 12));

  const head: string[][] = [[
    "#", "Model", "Description", "Qty", "Unit", "Remarks",
    ...(isApproval ? ["Decision"] : []),
    "Design · Model", "Design · Description", "Design · Qty", "Design · Unit", "Design · Remarks",
    ...(isApproval ? ["Change Note"] : []),
    "Files",
  ]];
  const body = buildRows(round, items, docs).map((r) => [
    String(r.item_no), r.model, r.description, String(r.qty), r.unit, r.remarks,
    ...(isApproval ? [r.decision] : []),
    r.d_model, r.d_description, r.d_quantity, r.d_unit, r.d_remarks,
    ...(isApproval ? [r.design_change_note] : []),
    r.files,
  ]);

  autoTable(doc, withPdfTableDefaults({
    head,
    body,
    startY: 54 + metaLines.length * 12 + 8,
    styles: { fontSize: 7.5, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 24, right: 24 },
    tableWidth: pageW - 48,
  }));

  // Attach the general (non-item) file links at the bottom, if any.
  const general = docs.filter((d) => !d.boq_item_id);
  if (general.length) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("General attachments:", 32, y + 18);
    doc.setFont("helvetica", "normal");
    const urls = await Promise.all(general.map((d) => signedDocUrl(d.file_path)));
    general.forEach((d, i) => {
      const url = urls[i];
      if (url) {
        doc.textWithLink(`• ${d.file_name}`, 32, y + 32 + i * 12, { url });
      } else {
        doc.text(`• ${d.file_name}`, 32, y + 32 + i * 12);
      }
    });
  }

  const fname = `${safeName(boq.boq_number || "BOQ")}_R${round.round_no}_${isApproval ? "Approval" : "Comment"}.pdf`;
  doc.save(fname);
}
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { amountInWords } from "./amountInWords";

export interface PoPdfPartyBlock {
  name: string;
  address?: string;
  gstin?: string;
  email?: string;
  state_code?: string;
  contact_person?: string;
  phone?: string;
}

export interface PoPdfBuyerBlock {
  invoice_to?: PoPdfPartyBlock;
  ship_to?: PoPdfPartyBlock;
  courier_address?: string;
}

export interface PoPdfRow {
  lot: string;
  material: string;
  size: string;
  make: string;
  qty: number | string;
  unit: string;
  dueOn?: string;
  rate?: number;
  discountPct?: number;
  gstPct?: number;
  gstAmount?: number;
  lineAmount?: number;
}

export interface PoPdfContext {
  poNumber: string;
  category: "steel" | "machine" | "3p";
  vendor: PoPdfPartyBlock;
  buyer: PoPdfBuyerBlock;
  preparedBy?: string;
  dispatchThrough?: string;
  destination?: string;
  paymentMode?: string;
  terms?: string;
  lots: string[];
  notes?: string;
  rows: PoPdfRow[];
  createdAt: string;
  subtotal?: number;
  taxTotal?: number;
  grandTotal?: number;
}

const catLabel: Record<PoPdfContext["category"], string> = {
  steel: "Steel",
  machine: "Machine",
  "3p": "3P / Outside Purchase",
};

function fmtINR(n: number | undefined | null): string {
  if (n == null || isNaN(Number(n))) return "";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generatePoPDF(ctx: PoPdfContext): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 10;
  const date = new Date(ctx.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // Title
  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("PURCHASE ORDER", W / 2, 14, { align: "center" });

  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`PO No : ${ctx.poNumber}`, M, 22);
  doc.text(`DATE : ${date}`, W - M, 22, { align: "right" });
  doc.text(`Category : ${catLabel[ctx.category]}`, M, 27);

  // Invoice To / Ship To split
  const colW = (W - 2 * M) / 2;
  let y = 33;
  doc.setFont("helvetica", "bold").text("Invoice To :", M, y);
  doc.text("SHIP TO :", M + colW, y);
  doc.setFont("helvetica", "normal");
  const invTo = ctx.buyer.invoice_to;
  const shipTo = ctx.buyer.ship_to || invTo;
  const partyLines = (p?: PoPdfPartyBlock): string[] => {
    if (!p) return [];
    return [
      p.name || "",
      ...(p.address ? doc.splitTextToSize(p.address, colW - 2) as string[] : []),
      p.gstin ? `GSTIN No. : ${p.gstin}` : "",
      p.email ? `EMAIL ID : ${p.email}` : "",
      p.state_code ? `STATE CODE : ${p.state_code}` : "",
    ].filter(Boolean);
  };
  const invLines = partyLines(invTo);
  const shipLines = partyLines(shipTo);
  const maxLines = Math.max(invLines.length, shipLines.length);
  y += 4;
  invLines.forEach((l, i) => doc.text(l, M, y + i * 4));
  shipLines.forEach((l, i) => doc.text(l, M + colW, y + i * 4));
  y += maxLines * 4 + 3;

  // Vendor details + Req/Mode block (3 cols)
  const col3 = (W - 2 * M) / 3;
  doc.setFont("helvetica", "bold");
  doc.text("VENDOR DETAILS :", M, y);
  doc.text(ctx.reqLine ? "REQ / PROJECT" : "", M + col3, y);
  doc.text("Mode & Terms Of Payment", M + col3 * 2, y);
  doc.setFont("helvetica", "normal");
  y += 4;
  const vLines = [
    `M/s ${ctx.vendor.name}`,
    ...(ctx.vendor.address ? doc.splitTextToSize(`Address : ${ctx.vendor.address}`, col3 - 2) as string[] : []),
    ctx.vendor.gstin ? `GSTIN No. ${ctx.vendor.gstin}` : "",
    ctx.vendor.contact_person ? `Contact : ${ctx.vendor.contact_person}` : "",
    ctx.vendor.phone ? `Phone : ${ctx.vendor.phone}` : "",
    ctx.vendor.email ? `Email : ${ctx.vendor.email}` : "",
    ctx.vendor.state_code ? `State Code : ${ctx.vendor.state_code}` : "",
  ].filter(Boolean);
  vLines.forEach((l, i) => doc.text(l, M, y + i * 4));

  const midLines = [
    ctx.reqLine || "",
    "",
    "Supplier's Ref/Order No.",
    "",
    "Dispatch through",
    ctx.dispatchThrough || "",
    "Destination",
    ctx.destination || "",
  ];
  midLines.forEach((l, i) => doc.text(l, M + col3, y + i * 4));

  const rightLines = [
    ctx.paymentMode || "",
    "",
    `Prepared By : ${ctx.preparedBy || "—"}`,
  ];
  rightLines.forEach((l, i) => doc.text(l, M + col3 * 2, y + i * 4));

  y += Math.max(vLines.length, midLines.length, rightLines.length) * 4 + 4;

  // Items table
  const body = ctx.rows.map((r, i) => [
    String(i + 1),
    r.material + (r.size ? ` (${r.size})` : ""),
    r.dueOn || "",
    String(r.qty ?? ""),
    r.rate != null ? fmtINR(r.rate) : "",
    r.discountPct != null ? `${r.discountPct}%` : "",
    r.gstPct != null ? `${r.gstPct}%` : "",
    r.gstAmount != null ? fmtINR(r.gstAmount) : "",
    r.lineAmount != null ? fmtINR(r.lineAmount) : "",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["S.NO.", "DESCRIPTION", "DUE ON", "QUANTITY", "RATE/UNIT", "DISCOUNT", "GST %", "GST AMOUNT", "AMOUNT"]],
    body,
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [120, 120, 120], lineWidth: 0.1 },
    headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold", lineColor: [120, 120, 120], lineWidth: 0.1 },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "right", cellWidth: 16 },
      4: { halign: "right", cellWidth: 18 },
      5: { halign: "right", cellWidth: 16 },
      6: { halign: "right", cellWidth: 12 },
      7: { halign: "right", cellWidth: 20 },
      8: { halign: "right", cellWidth: 22 },
    },
    margin: { left: M, right: M },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fy = (doc as any).lastAutoTable?.finalY ?? y + 30;
  fy += 4;

  const totalQty = ctx.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const subtotal = ctx.subtotal ?? ctx.rows.reduce((s, r) => s + (r.lineAmount || 0), 0);
  const tax = ctx.taxTotal ?? ctx.rows.reduce((s, r) => s + (r.gstAmount || 0), 0);
  const grand = ctx.grandTotal ?? subtotal + tax;

  // Totals block
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text(`TOTAL QTY : ${totalQty}`, M, fy);
  const rightX = W - M;
  const labelX = rightX - 50;
  doc.text("BASIC", labelX, fy, { align: "right" });
  doc.text(fmtINR(subtotal), rightX, fy, { align: "right" });
  doc.text("IGST", labelX, fy + 5, { align: "right" });
  doc.text(fmtINR(tax), rightX, fy + 5, { align: "right" });
  doc.text("GRAND TOTAL", labelX, fy + 10, { align: "right" });
  doc.text(fmtINR(grand), rightX, fy + 10, { align: "right" });

  doc.setFont("helvetica", "normal").setFontSize(8);
  const words = amountInWords(grand);
  doc.text(doc.splitTextToSize(words, W / 2 - M) as string[], M, fy + 6);

  fy += 18;
  if (ctx.terms) {
    doc.setFont("helvetica", "bold").setFontSize(8.5);
    doc.text("Terms Of Delivery :", M, fy);
    doc.setFont("helvetica", "normal").setFontSize(8);
    const tlines = doc.splitTextToSize(ctx.terms, W - 2 * M) as string[];
    doc.text(tlines, M, fy + 4);
    fy += 4 + tlines.length * 4;
  }
  if (ctx.notes) {
    doc.setFont("helvetica", "bold").setFontSize(8.5);
    doc.text("Notes :", M, fy + 4);
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(doc.splitTextToSize(ctx.notes, W - 2 * M) as string[], M, fy + 8);
  }

  return doc;
}

export function financialYearOf(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  // FY starts April. e.g. June 2026 -> 26-27
  const startYear = m >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(2)}-${String(endYear).slice(2)}`;
}
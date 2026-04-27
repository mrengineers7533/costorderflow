import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderRecord } from "./types";
import { DEFAULT_MR_BANK, DEFAULT_MR_TERMS, MR_FOOTER_ADDRESS, type BankDetails } from "./defaults";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";

const logoCache: Record<string, string> = {};
async function loadLogo(url: string): Promise<string | null> {
  if (logoCache[url]) return logoCache[url];
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    logoCache[url] = dataUrl;
    return dataUrl;
  } catch (e) {
    console.warn("Logo load failed", url, e);
    return null;
  }
}

const COMPANY_MR = {
  name: "M.R. Engineers",
  tagline: "*  ENGINEERS    *  CONTRACTORS    *  SUPPLIERS",
  address: "Shed No. 33, HSIIDC, Murthal, Sonepat.",
  gstin: "06AARPM1849G1ZF",
};
const COMPANY_GMS = {
  name: "GMS ENGINEERING",
  address: "IMT Manesar, Gurgaon, Haryana, India",
  gstin: "—",
  phone: "+91-124-0000000",
  email: "info@gmsengg.com",
};

export async function generateOrderPDF(order: OrderRecord, opts?: { terms?: string; bank?: BankDetails }): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const company = order.format === "MR" ? COMPANY_MR : COMPANY_GMS;
  const accent: [number, number, number] = order.format === "MR" ? [234, 88, 12] : [22, 163, 74];

  let y = M;

  // Header banner
  const headerH = 26;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, headerH, "F");
  if (order.format === "MR") {
    const logo = await loadLogo(mrLogoUrl);
    if (logo) {
      try {
        doc.addImage(logo, "PNG", M, 3, 60, 20);
      } catch (e) {
        console.warn("addImage failed", e);
      }
    }
    // Right-aligned company block matching the official MR template
    const rightX = W - M;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold").setFontSize(18);
    doc.text(COMPANY_MR.name, rightX, 9, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text(COMPANY_MR.tagline, rightX, 14, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(COMPANY_MR.address, rightX, 18, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text(`GSTIN-${COMPANY_MR.gstin}`, rightX, 22, { align: "right" });
    // Thin accent rule under header
    doc.setDrawColor(...accent).setLineWidth(0.6);
    doc.line(0, headerH, W, headerH);
  } else {
    // GMS: white header with logo + accent rule
    const logo = await loadLogo(gmsLogoUrl);
    if (logo) {
      try {
        doc.addImage(logo, "PNG", M, 3, 40, 20);
      } catch (e) {
        console.warn("addImage failed", e);
      }
    }
    const textX = M + 44;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold").setFontSize(14);
    doc.text(company.name, textX, 10);
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(company.address, textX, 15);
    doc.text(`GSTIN: ${company.gstin}`, textX, 19);
    doc.setDrawColor(...accent).setLineWidth(0.6);
    doc.line(0, headerH, W, headerH);
  }

  y = headerH + 6;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("ORDER ACCEPTANCE", W / 2, y, { align: "center" });
  y += 6;

  // Meta box
  doc.setFontSize(9).setFont("helvetica", "normal");
  const metaLeft = [
    ["OA Number", order.oa_number],
    ["Date", new Date(order.order_date).toLocaleDateString("en-IN")],
    ["Reference", order.reference || order.cost_sheet_number || "-"],
  ];
  const metaRight = [
    ["Prepared By", order.prepared_by || "-"],
    ["Format", order.format],
    ["Status", order.status.toUpperCase()],
  ];
  metaLeft.forEach((row, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(row[0] + ":", M, y + i * 5);
    doc.setFont("helvetica", "normal");
    doc.text(String(row[1]), M + 28, y + i * 5);
  });
  metaRight.forEach((row, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(row[0] + ":", W / 2 + 5, y + i * 5);
    doc.setFont("helvetica", "normal");
    doc.text(String(row[1]), W / 2 + 35, y + i * 5);
  });
  y += 18;

  // Bill To / Ship To
  const boxW = (W - M * 2 - 4) / 2;
  doc.setDrawColor(...accent).setLineWidth(0.3);
  doc.rect(M, y, boxW, 28);
  doc.rect(M + boxW + 4, y, boxW, 28);
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...accent);
  doc.text("BILL TO", M + 2, y + 5);
  doc.text("SHIP TO", M + boxW + 6, y + 5);
  doc.setTextColor(0, 0, 0).setFont("helvetica", "normal").setFontSize(8);
  const billLines = [
    order.bill_to.name || "",
    order.bill_to.address || "",
    order.bill_to.gstin ? `GSTIN: ${order.bill_to.gstin}` : "",
    order.bill_to.state ? `State: ${order.bill_to.state}` : "",
  ].filter(Boolean);
  const shipLines = [
    order.ship_to.name || order.bill_to.name || "",
    order.ship_to.address || order.bill_to.address || "",
    order.ship_to.gstin ? `GSTIN: ${order.ship_to.gstin}` : "",
    order.ship_to.state ? `State: ${order.ship_to.state}` : "",
  ].filter(Boolean);
  billLines.forEach((l, i) => doc.text(doc.splitTextToSize(l, boxW - 4), M + 2, y + 10 + i * 4));
  shipLines.forEach((l, i) => doc.text(doc.splitTextToSize(l, boxW - 4), M + boxW + 6, y + 10 + i * 4));
  y += 32;

  // Unified Items + Totals table (matches reference template structure)
  const c = order.charges;
  const t = order.totals;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const itemRows = order.line_items.map((it, i) => [
    String(i + 1),
    it.description,
    it.hsn_code || "",
    String(it.quantity),
    it.unit || "Nos",
    fmt(it.unit_rate),
    fmt(it.amount),
  ]);

  const totalsRows: Array<{ label: string; value: number; bold?: boolean }> = [];
  totalsRows.push({ label: "Basic Total", value: t.basic_total });
  if (c.pf_amount > 0 || c.pf_percent > 0) {
    const pf = c.pf_amount > 0 ? c.pf_amount : (t.basic_total * c.pf_percent) / 100;
    totalsRows.push({ label: `P&F${c.pf_percent ? ` @ ${c.pf_percent}%` : ""}`, value: pf });
  }
  const ins = c.insurance_percent > 0 ? (t.basic_total * c.insurance_percent) / 100 : (c.insurance || 0);
  if (ins > 0) totalsRows.push({ label: `Insurance${c.insurance_percent ? ` @ ${c.insurance_percent}%` : ""}`, value: ins });
  if (c.freight_enabled && c.freight > 0) totalsRows.push({ label: "Freight", value: c.freight });
  totalsRows.push({ label: "Subtotal", value: t.subtotal });
  const gst = c.gst_amount ?? (t.subtotal * (c.gst_percent || 0)) / 100;
  totalsRows.push({ label: `GST @ ${c.gst_percent || 0}%`, value: gst });
  if (c.discount > 0 || c.discount_percent > 0) {
    const disc = c.discount_percent > 0 ? (t.grand_total * c.discount_percent) / 100 : c.discount;
    if (disc > 0) totalsRows.push({ label: `Discount${c.discount_percent ? ` @ ${c.discount_percent}%` : ""}`, value: -disc });
  }
  totalsRows.push({ label: "Grand Total", value: t.net_payable, bold: true });

  const totalsAsBody = totalsRows.map((r) => [
    { content: r.label, colSpan: 6, styles: { halign: "right" as const, fontStyle: (r.bold ? "bold" : "bold") as "bold" } },
    { content: fmt(r.value), styles: { halign: "right" as const, fontStyle: (r.bold ? "bold" : "normal") as "bold" | "normal", fillColor: r.bold ? ([255, 235, 59] as [number, number, number]) : undefined } },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["S. No.", "Item Description", "HSN Code", "Qty.", "Unit", "Rate", "Amount"]],
    body: [...itemRows, ...totalsAsBody as never[]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: [0, 0, 0], lineWidth: 0.2, valign: "top" },
    headStyles: { fillColor: accent, textColor: 255, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 28, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("Amount in Words:", M, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(order.amount_in_words || "", W - M * 2 - 30), M + 30, y);
  y += 8;

  // MR-format post-items section (single full-width table matching template)
  if (order.format === "MR") {
    const terms = opts?.terms ?? DEFAULT_MR_TERMS;
    const bank = opts?.bank ?? DEFAULT_MR_BANK;
    const tableW = W - M * 2;

    // Terms & Conditions row
    autoTable(doc, {
      startY: y,
      body: [[{
        content: `TERMS & CONDITIONS\n${terms}`,
        styles: { fontStyle: "normal", fontSize: 8, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
      }]],
      theme: "plain",
      margin: { left: M, right: M },
      tableWidth: tableW,
      didParseCell: (data) => {
        // Bold the first line only via overall bold + manual is hard; keep simple.
        data.cell.styles.lineColor = [0, 0, 0];
        data.cell.styles.lineWidth = 0.3;
      },
    });
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

    // Bank + Signature row (two columns)
    const bankBody =
      `OUR BANK DETAILS :-\n${bank.bank_name}\nBRANCH: ${bank.branch}\nC/A A/C NO. ${bank.account_no}\nIFSC CODE: ${bank.ifsc}`;
    const sigBody = `Yours faithfully\n\n\nM.R. ENGINEERS${order.prepared_by ? `\n${order.prepared_by}` : ""}`;
    autoTable(doc, {
      startY: y,
      body: [[
        { content: bankBody, styles: { fontSize: 8, cellPadding: 2, valign: "top" } },
        { content: sigBody, styles: { fontSize: 8, cellPadding: 2, halign: "right", valign: "top", fontStyle: "bold" } },
      ]],
      theme: "grid",
      margin: { left: M, right: M },
      tableWidth: tableW,
      columnStyles: { 0: { cellWidth: tableW / 2 }, 1: { cellWidth: tableW / 2 } },
      styles: { lineColor: [0, 0, 0], lineWidth: 0.3 },
    });
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

    // Footer address band (yellow strip)
    autoTable(doc, {
      startY: y,
      body: [[MR_FOOTER_ADDRESS]],
      theme: "plain",
      margin: { left: M, right: M },
      tableWidth: tableW,
      styles: {
        fontSize: 8, fontStyle: "bold", halign: "center", cellPadding: 2,
        fillColor: [255, 192, 0], textColor: [0, 0, 0],
        lineColor: [0, 0, 0], lineWidth: 0.3,
      },
    });
  }

  return doc;
}

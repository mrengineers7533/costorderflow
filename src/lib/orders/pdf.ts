import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderRecord } from "./types";
import {
  DEFAULT_MR_BANK,
  DEFAULT_MR_TERMS,
  MR_FOOTER_ADDRESS,
  DEFAULT_GMS_BANK,
  DEFAULT_GMS_TERMS,
  GMS_HEAD_OFFICE_LINES,
  type BankDetails,
  type GMSTerms,
} from "./defaults";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";

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

export async function generateOrderPDF(
  order: OrderRecord,
  opts?: { terms?: string; bank?: BankDetails; gmsTerms?: GMSTerms },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;

  if (order.format === "GMS") {
    await renderGmsPdf(doc, order, opts, { W, H, M });
    return doc;
  }

  const company = COMPANY_MR;
  const accent: [number, number, number] = [234, 88, 12];
  let y = M;

  // Header banner
  const headerH = 26;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, headerH, "F");
  {
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
  {
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
    // Small right-aligned "M.R. ENGINEERS" label sitting just above the yellow strip
    autoTable(doc, {
      startY: y,
      body: [[{
        content: "M.R. ENGINEERS",
        styles: {
          fontSize: 8, fontStyle: "bold", halign: "right", cellPadding: 1.2,
          textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.3,
        },
      }]],
      theme: "plain",
      margin: { left: M, right: M },
      tableWidth: tableW,
    });
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

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

/* ---------------------------------------------------------------------------
 * GMS PDF rendering (matches uploaded Union Agrotech / UGUR template)
 * -------------------------------------------------------------------------*/

interface GmsLayout { W: number; H: number; M: number }

const GMS_HEADER_H = 32; // mm — reserved space for the dual-logo banner
const GMS_TITLE_BAR_H = 7; // mm — grey "ORDER ACCEPTANCE" bar
const GMS_FOOTER_RESERVED = 38; // mm — reserved for HEAD OFFICE / Bank block

async function renderGmsPdf(
  doc: jsPDF,
  order: OrderRecord,
  opts: { terms?: string; bank?: BankDetails; gmsTerms?: GMSTerms } | undefined,
  layout: GmsLayout,
) {
  const { W, H, M } = layout;
  const bank = opts?.bank ?? DEFAULT_GMS_BANK;
  const terms = opts?.gmsTerms ?? DEFAULT_GMS_TERMS;

  const gmsLogo = await loadLogo(gmsLogoUrl);
  const ugurLogo = await loadLogo(ugurLogoUrl);

  const drawHeader = () => {
    // White background banner
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, GMS_HEADER_H, "F");

    // Left: GMS logo + caption
    if (gmsLogo) {
      try { doc.addImage(gmsLogo, "PNG", M, 3, 55, 18); } catch (e) { console.warn("gms logo", e); }
    }
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(10);
    doc.text("GRAIN MILLING SOLUTIONS PRIVATE LIMITED", M, 25);

    // Right: Uğur logo + caption + tagline
    const rightX = W - M;
    if (ugurLogo) {
      try { doc.addImage(ugurLogo, "PNG", rightX - 45, 3, 45, 18); } catch (e) { console.warn("ugur logo", e); }
    }
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("UGUR MACHINE, TURKEY", rightX, 25, { align: "right" });
    doc.setFont("helvetica", "italic").setFontSize(7);
    doc.text("Quality Standard is an Assurance of UGUR at all parts", rightX, 29, { align: "right" });

    // Grey "ORDER ACCEPTANCE" title bar directly under the header
    doc.setFillColor(200, 200, 200);
    doc.rect(M, GMS_HEADER_H, W - M * 2, GMS_TITLE_BAR_H, "F");
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(13);
    doc.text("ORDER ACCEPTANCE", W / 2, GMS_HEADER_H + 5, { align: "center" });
  };

  const drawFooterBlock = (startY: number) => {
    const colW = (W - M * 2) / 2;
    let yL = startY;
    let yR = startY;
    // Left: HEAD OFFICE
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(10);
    doc.text("HEAD OFFICE", M, yL); yL += 4;
    doc.setFont("helvetica", "normal").setFontSize(9);
    GMS_HEAD_OFFICE_LINES.forEach((line) => { doc.text(line, M, yL); yL += 4; });

    // Right: Our Bank Details
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("Our Bank Details :", M + colW, yR); yR += 4;
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text("GRAIN MILLING SOLUTIONS PVT. LTD.", M + colW, yR); yR += 4;
    doc.setFont("helvetica", "bold");
    doc.text(`Bank : ${bank.bank_name}`, M + colW, yR); yR += 4;
    doc.setFont("helvetica", "normal");
    doc.text(`Branch : ${bank.branch}`, M + colW, yR); yR += 4;
    doc.text(`A/C No : ${bank.account_no}`, M + colW, yR); yR += 4;
    doc.text(`IFSC CODE : ${bank.ifsc}`, M + colW, yR); yR += 4;
  };

  // -------- Page 1: header (drawHeader called inline + via didDrawPage) --------
  drawHeader();

  // Customer / Meta block
  let y = GMS_HEADER_H + GMS_TITLE_BAR_H + 5;
  const colW = (W - M * 2) / 2;
  doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(9);
  // Left column lines
  const leftLines: string[] = [];
  leftLines.push(`M/s ${order.bill_to.name || order.company_name || ""}`.trim());
  if (order.bill_to.address) leftLines.push(order.bill_to.address);
  if (order.bill_to.contact_person) leftLines.push(`Contact Person Name : ${order.bill_to.contact_person}`);
  if (order.bill_to.contact_number) leftLines.push(`Mobile No.: ${order.bill_to.contact_number}`);
  if (order.bill_to.email) leftLines.push(`Email:- ${order.bill_to.email}`);
  if (order.bill_to.gstin) {
    const sc = order.bill_to.state_code ? `, State Code - ${order.bill_to.state_code}` : "";
    leftLines.push(`GSTIN No.-${order.bill_to.gstin}${sc}`);
  }
  let yL = y;
  doc.setFont("helvetica", "bold").setFontSize(9);
  leftLines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    const wrapped = doc.splitTextToSize(line, colW - 4);
    wrapped.forEach((w: string) => { doc.text(w, M, yL); yL += 4; });
  });

  // Right column lines (right-aligned)
  const rightX = W - M;
  let yR = y;
  const rightLines: string[] = [
    `Date : ${new Date(order.order_date).toLocaleDateString("en-GB").replace(/\//g, "-")}`,
    `OA No.: ${order.oa_number}`,
    `Ref. : ${order.reference || order.cost_sheet_number || "-"}`,
    `Contact :- Mr. Bhavesh Makin`,
    `Mob : - +91-9910066823`,
  ];
  if (order.prepared_by) rightLines.push(`Prepared By:- ${order.prepared_by}`);
  doc.setFont("helvetica", "bold").setFontSize(9);
  rightLines.forEach((line) => { doc.text(line, rightX, yR, { align: "right" }); yR += 4; });

  y = Math.max(yL, yR) + 3;

  // Items + Totals table
  const c = order.charges;
  const t = order.totals;
  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const itemRows = order.line_items.map((it, i) => [
    String(i + 1),
    "", // model number — not stored separately; left blank
    it.description,
    it.hsn_code || "",
    String(it.quantity),
    it.unit || "Nos",
    fmt(it.unit_rate),
    fmt(it.amount),
  ]);

  const totalsRows: Array<{ label: string; value: number; bold?: boolean }> = [];
  totalsRows.push({ label: "Ex-works Murthal Price", value: t.basic_total });
  if (c.discount > 0 || c.discount_percent > 0) {
    const disc = c.discount_percent > 0 ? (t.basic_total * c.discount_percent) / 100 : c.discount;
    if (disc > 0) {
      totalsRows.push({ label: "One time very special Discount", value: disc });
      totalsRows.push({ label: "After Discount", value: Math.max(0, t.basic_total - disc) });
    }
  }
  if (c.pf_amount > 0 || c.pf_percent > 0) {
    const pf = c.pf_amount > 0 ? c.pf_amount : (t.basic_total * c.pf_percent) / 100;
    if (pf > 0) totalsRows.push({ label: "Packaging & Forwarding", value: pf });
  }
  const ins = c.insurance_percent > 0 ? (t.basic_total * c.insurance_percent) / 100 : (c.insurance || 0);
  if (ins > 0) totalsRows.push({ label: "Insurance", value: ins });
  if (c.freight_enabled && c.freight > 0) totalsRows.push({ label: "Freight", value: c.freight });
  const gst = c.gst_amount ?? (t.subtotal * (c.gst_percent || 0)) / 100;
  if (gst > 0) totalsRows.push({ label: `GST @${c.gst_percent || 0}%`, value: gst });
  totalsRows.push({ label: "Grand Total", value: t.net_payable, bold: true });

  const totalsAsBody = totalsRows.map((r) => [
    {
      content: r.label,
      colSpan: 7,
      styles: { halign: "right" as const, fontStyle: "bold" as const },
    },
    {
      content: fmt(r.value),
      styles: {
        halign: "right" as const,
        fontStyle: (r.bold ? "bold" : "normal") as "bold" | "normal",
      },
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [[
      "ITEM NO", "MODEL NUMBER", "DESCRIPTION", "HSN CODE",
      "QTY", "UNIT", "UNIT PRICE\n(INR)", "AMOUNT\n(INR)",
    ]],
    body: [...itemRows, ...totalsAsBody as never[]],
    theme: "grid",
    styles: {
      fontSize: 8, cellPadding: 2,
      lineColor: [0, 0, 0], lineWidth: 0.2, valign: "middle",
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [220, 220, 220], textColor: [0, 0, 0],
      halign: "center", fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: 24, halign: "left" },
      2: { cellWidth: "auto", halign: "left" },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 24, halign: "right" },
      7: { cellWidth: 26, halign: "right" },
    },
    margin: { left: M, right: M, top: GMS_HEADER_H + GMS_TITLE_BAR_H + 4, bottom: GMS_FOOTER_RESERVED },
    didDrawPage: () => { drawHeader(); },
  });

  // @ts-expect-error lastAutoTable runtime
  let yEnd = doc.lastAutoTable.finalY + 6;

  // If footer block won't fit on the current page, push to a new one
  if (yEnd + GMS_FOOTER_RESERVED > H - M) {
    doc.addPage();
    drawHeader();
    yEnd = GMS_HEADER_H + GMS_TITLE_BAR_H + 8;
  }
  drawFooterBlock(yEnd);

  // -------- Terms & Conditions page --------
  doc.addPage();
  drawHeader();
  let yT = GMS_HEADER_H + GMS_TITLE_BAR_H + 8;

  doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(18);
  doc.text("TERMS & CONDITIONS", W / 2, yT, { align: "center" });
  yT += 10;

  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("COMMERCIAL CONDITION :", M, yT);
  // underline
  const tw = doc.getTextWidth("COMMERCIAL CONDITION :");
  doc.setDrawColor(0, 0, 0).setLineWidth(0.3);
  doc.line(M, yT + 0.8, M + tw, yT + 0.8);
  yT += 8;

  const sections: Array<[string, string]> = [
    ["Taxation :", terms.taxation],
    ["Freight :", terms.freight],
    ["INSURANCE :", terms.insurance],
    ["Delivery Time :", terms.delivery_time],
    ["Payment Terms :", terms.payment_terms],
    ["General Conditions :", terms.general_conditions],
  ];
  sections.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(label, M, yT); yT += 5;
    doc.setFont("helvetica", "normal").setFontSize(9);
    const wrapped = doc.splitTextToSize(value || "-", W - M * 2);
    wrapped.forEach((w: string) => { doc.text(w, M, yT); yT += 4.5; });
    yT += 3;
  });

  // Footer block on T&C page (anchored near bottom)
  const footerStart = Math.max(yT + 4, H - GMS_FOOTER_RESERVED);
  drawFooterBlock(footerStart);
}

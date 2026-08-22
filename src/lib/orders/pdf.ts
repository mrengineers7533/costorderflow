import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderRecord } from "./types";
import { calcExTurkey, calcExMurthal, amountInWordsUSD, amountInWords, displayMake } from "./calc";
import { visibleColumns, type PdfColumnKey } from "./pdfColumns";
import {
  DEFAULT_MR_BANK,
  DEFAULT_MR_TERMS,
  MR_FOOTER_ADDRESS,
  DEFAULT_GMS_BANK,
  DEFAULT_GMS_TERMS,
  GMS_HEAD_OFFICE_LINES,
  DEFAULT_GMS_EXCLUSIONS,
  type BankDetails,
  type GMSTerms,
} from "./defaults";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";
import { withPdfTableDefaults } from "@/lib/pdf/tableStyles";

interface LoadedLogo { dataUrl: string; w: number; h: number }
const logoCache: Record<string, LoadedLogo> = {};
async function loadLogo(url: string): Promise<LoadedLogo | null> {
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
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    const entry = { dataUrl, w: dims.w, h: dims.h };
    logoCache[url] = entry;
    return entry;
  } catch (e) {
    console.warn("Logo load failed", url, e);
    return null;
  }
}

/** Contain-fit: largest w×h preserving aspect ratio that fits inside maxW×maxH. */
function fitInBox(natW: number, natH: number, maxW: number, maxH: number) {
  const r = Math.min(maxW / natW, maxH / natH);
  return { w: natW * r, h: natH * r };
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

export interface ExtraTotalsRow {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: boolean;
}

export interface DocMetaOverride {
  /** Replaces "ORDER ACCEPTANCE" centered title. */
  title?: string;
  /** Replaces "OA Number" / "OA No.:" label. */
  numberLabel?: string;
  /** Replaces the OA number value. */
  numberValue?: string;
  /** Optional second meta line (e.g. Reference OA No.). MR uses Reference slot. */
  refLabel?: string;
  refValue?: string;
  /** Extra rows appended to the totals section (e.g. PI Discount / Advance / Net). */
  extraTotalsRows?: ExtraTotalsRow[];
  /** When true, hide the default Grand Total row so PI can supply its own chain. */
  hideDefaultGrandTotal?: boolean;
  /** When true (PI), hide the page-1 HEAD OFFICE/Bank/Exclusions footer block; render it on the T&C page instead. */
  hideFirstPageFooter?: boolean;
}

export async function generateOrderPDF(
  order: OrderRecord,
  opts?: { terms?: string; bank?: BankDetails; gmsTerms?: GMSTerms; tcNote?: string; docMeta?: DocMetaOverride; currencyMode?: "INR" | "USD"; hiddenColumns?: PdfColumnKey[] },
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
        const fit = fitInBox(logo.w, logo.h, 60, 20);
        doc.addImage(logo.dataUrl, "PNG", M, 3, fit.w, fit.h);
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
  doc.text(opts?.docMeta?.title || "ORDER ACCEPTANCE", W / 2, y, { align: "center" });
  y += 6;

  // Meta box
  doc.setFontSize(9).setFont("helvetica", "normal");
  const metaLeft = [
    [opts?.docMeta?.numberLabel || "OA Number", opts?.docMeta?.numberValue || order.oa_number],
    [
      opts?.docMeta?.refLabel || "Reference",
      opts?.docMeta?.refValue ?? (order.reference || order.cost_sheet_number || "-"),
    ],
  ];
  const metaRight = [
    ["Date", new Date(order.order_date).toLocaleDateString("en-IN")],
    ["Prepared By", order.prepared_by || "-"],
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
  y += 13;

  // Bill To / Ship To
  const boxW = (W - M * 2 - 4) / 2;
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
  const drawWrapped = (lines: string[], x: number) => {
    let row = 0;
    lines.forEach((l) => {
      const wrapped = doc.splitTextToSize(l, boxW - 4) as string[];
      wrapped.forEach((w) => {
        doc.text(w, x, y + 10 + row * 4);
        row += 1;
      });
    });
    return row;
  };
  const billRows = drawWrapped(billLines, M + 2);
  const shipRows = drawWrapped(shipLines, M + boxW + 6);
  const maxRows = Math.max(billRows, shipRows, 4);
  const boxH = 10 + maxRows * 4;
  // Redraw boxes to fit content height
  doc.setDrawColor(...accent).setLineWidth(0.3);
  doc.rect(M, y, boxW, boxH);
  doc.rect(M + boxW + 4, y, boxW, boxH);
  y += boxH + 4;

  // Unified Items + Totals table (matches reference template structure)
  const c = order.charges;
  const t = order.totals;
  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Dynamic columns — user may hide non-required cells in the PDF.
  const mrCols = visibleColumns("MR", opts?.hiddenColumns);
  const mrColCellFor = (k: PdfColumnKey, it: OrderRecord["line_items"][number], idx: number): string => {
    switch (k) {
      case "item_no":     return String(idx + 1);
      case "description": return it.description || "";
      case "make":        return displayMake(it);
      case "qty":         return String(it.quantity);
      case "unit":        return it.unit || "Nos";
      case "rate":        return fmt(it.unit_rate);
      case "amount":      return fmt(it.amount);
      default:            return "";
    }
  };
  const mrColLabel: Record<PdfColumnKey, string> = {
    item_no: "S. No.", model_number: "", description: "Item Description",
    make: "Make", qty: "Qty.", unit: "Unit", rate: "Rate", amount: "Amount",
  };
  const mrColWidthStyle: Partial<Record<PdfColumnKey, { cellWidth: number | "auto"; halign: "left" | "right" | "center" }>> = {
    item_no:     { cellWidth: 12, halign: "center" },
    description: { cellWidth: "auto", halign: "left" },
    make:        { cellWidth: 28, halign: "center" },
    qty:         { cellWidth: 12, halign: "center" },
    unit:        { cellWidth: 12, halign: "center" },
    rate:        { cellWidth: 24, halign: "right" },
    amount:      { cellWidth: 28, halign: "right" },
  };
  const itemRows = order.line_items.map((it, i) => mrCols.map((k) => mrColCellFor(k, it, i)));

  const totalsRows: Array<{ label: string; value: number; bold?: boolean; inr?: boolean }> = [];
  // Discount applies ONLY on Basic. When toggled on, show Sub Total → Discount
  // → After Discount, then P&F/Insurance/Freight, then GST, then Grand Total.
  const rawDiscount = c.discount_percent > 0
    ? (t.basic_total * c.discount_percent) / 100
    : (c.discount || 0);
  const showDiscount = (c.apply_discount ?? (rawDiscount > 0)) && rawDiscount > 0;
  const discountLabel = (c.discount_label || "One Time Very Special Discount").trim()
    || "One Time Very Special Discount";
  const discountAmt = showDiscount ? rawDiscount : 0;
  const basicAfterDiscount = t.basic_total - discountAmt;

  totalsRows.push({ label: showDiscount ? "Sub Total" : "Basic Total", value: t.basic_total });
  if (showDiscount) {
    totalsRows.push({ label: discountLabel, value: discountAmt });
    totalsRows.push({ label: "After Discount", value: basicAfterDiscount });
  }
  // Charges base — when discount applied, % charges resolve against the
  // discounted basic; otherwise legacy behaviour (against Basic Total).
  const chargesBase = showDiscount ? basicAfterDiscount : t.basic_total;
  if (c.pf_amount > 0 || c.pf_percent > 0) {
    const pf = c.pf_amount > 0 ? c.pf_amount : (chargesBase * c.pf_percent) / 100;
    totalsRows.push({ label: `P&F${c.pf_percent ? ` @ ${c.pf_percent}%` : ""}`, value: pf });
  }
  const ins = c.insurance_percent > 0 ? (chargesBase * c.insurance_percent) / 100 : (c.insurance || 0);
  if (ins > 0) totalsRows.push({ label: `Insurance${c.insurance_percent ? ` @ ${c.insurance_percent}%` : ""}`, value: ins });
  if (c.freight_enabled && c.freight > 0) totalsRows.push({ label: "Freight", value: c.freight });
  // Taxable value (subtotal) is unchanged when no discount; when discount is
  // applied, recompute it because the legacy `t.subtotal` was based on the
  // pre-discount basic. We avoid showing a "Subtotal" row in the discount
  // layout because the screenshot doesn't include one before GST.
  const pfFinal = c.pf_amount > 0 ? c.pf_amount : (chargesBase * (c.pf_percent || 0)) / 100;
  const freightFinal = c.freight_enabled ? (c.freight || 0) : 0;
  const taxable = chargesBase + pfFinal + ins + freightFinal;
  if (!showDiscount) {
    totalsRows.push({ label: "Subtotal", value: taxable });
  }
  // Prefer percent when set; only fall back to a stored amount when no percent
  // is configured. Using `??` here was wrong because `gst_amount` defaults to
  // 0 (not null/undefined), which forced GST to render as 0 in the PDF even
  // when `gst_percent` was set.
  const gst = (c.gst_percent || 0) > 0
    ? (taxable * c.gst_percent) / 100
    : (c.gst_amount || 0);
  totalsRows.push({ label: `GST @ ${c.gst_percent || 0}%`, value: gst });
  if (!opts?.docMeta?.hideDefaultGrandTotal) {
    // Always derive the grand total from the rows we just printed so the
    // displayed numbers add up. (Previously the no-discount path used
    // `t.net_payable`, which silently included GST even when the GST row
    // showed 0, making rows and total disagree.)
    const grand = taxable + gst;
    totalsRows.push({ label: "Grand Total", value: grand, bold: true });
    // MR Advance Adjustment (deducted from Grand Total → Net Payable).
    if (order.format === "MR" && c.mr_advance_enabled) {
      const mode = c.mr_advance_mode || "percent";
      const adv = mode === "percent"
        ? (basicAfterDiscount * (c.mr_advance_percent || 0)) / 100
        : (c.mr_advance_amount || 0);
      if (adv > 0) {
        const lbl = mode === "percent"
          ? `Advance Adjustment @ ${c.mr_advance_percent || 0}%`
          : "Advance Adjustment";
        totalsRows.push({ label: lbl, value: adv });
        totalsRows.push({ label: "Net Payable", value: Math.max(0, grand - adv), bold: true });
      }
    }
  }
  // Extra rows (e.g. PI: One-Time Discount / Advance Adjustment / Net Payable)
  if (opts?.docMeta?.extraTotalsRows?.length) {
    for (const r of opts.docMeta.extraTotalsRows) {
      totalsRows.push({ label: r.label, value: r.value, bold: !!r.bold });
    }
  }

  // Totals: render as 2 cells inside the items table — label spans all
  // visible columns except the last, value occupies the trailing column.
  // When the user hides "Amount", the value naturally lands in whichever
  // column is now last (e.g. Rate). Bottom totals stay visible regardless.
  const mrLabelSpan = Math.max(1, mrCols.length - 1);
  const totalsAsBody = totalsRows.map((r) => [
    { content: r.label, colSpan: mrLabelSpan, styles: { halign: "right" as const, fontStyle: "bold" as const } },
    { content: fmt(r.value), styles: { halign: "right" as const, fontStyle: (r.bold ? "bold" : "normal") as "bold" | "normal", fillColor: r.bold ? ([255, 235, 59] as [number, number, number]) : undefined } },
  ]);

  const mrColumnStyles: Record<number, { cellWidth: number | "auto"; halign?: "left" | "right" | "center" }> = {};
  mrCols.forEach((k, i) => {
    const s = mrColWidthStyle[k];
    if (s) mrColumnStyles[i] = s;
  });
  autoTable(doc, withPdfTableDefaults({
    startY: y,
    head: [mrCols.map((k) => mrColLabel[k])],
    body: [...itemRows, ...totalsAsBody as never[]],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2.2, lineColor: [0, 0, 0], lineWidth: 0.2, valign: "middle", minCellHeight: 7 },
    headStyles: { fillColor: accent, textColor: 255, halign: "center", valign: "middle", fontStyle: "bold", cellPadding: 2.2, minCellHeight: 8 },
    columnStyles: mrColumnStyles,
    margin: { left: M, right: M },
  }));

  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 4;

  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("Amount in Words:", M, y);
  doc.setFont("helvetica", "normal");
  const mrWords = opts?.currencyMode === "USD"
    ? amountInWordsUSD(t.net_payable)
    : (order.amount_in_words || "").replace(/^INR\s*/i, "RS. ");
  doc.text(doc.splitTextToSize(mrWords, W - M * 2 - 30), M + 30, y);
  y += 8;

  // MR-format post-items section (single full-width table matching template)
  {
    const terms = opts?.terms ?? DEFAULT_MR_TERMS;
    const bank = opts?.bank ?? DEFAULT_MR_BANK;
    const tcNote = (opts?.tcNote || (order as unknown as { tc_note?: string }).tc_note || "").trim();
    const tableW = W - M * 2;

    // Terms & Conditions row
    autoTable(doc, withPdfTableDefaults({
      startY: y,
      body: [[{
        content: `TERMS & CONDITIONS\n${terms}${tcNote ? `\n\nNote: ${tcNote}` : ""}`,
        styles: { fontStyle: "normal", fontSize: 7.5, cellPadding: 1.6, lineWidth: 0.3, lineColor: [0, 0, 0] },
      }]],
      theme: "plain",
      margin: { left: M, right: M },
      tableWidth: tableW,
      didParseCell: (data) => {
        // Bold the first line only via overall bold + manual is hard; keep simple.
        data.cell.styles.lineColor = [0, 0, 0];
        data.cell.styles.lineWidth = 0.3;
      },
    }));
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

    // Bank + Signature row (two columns)
    const bankBody =
      `OUR BANK DETAILS :-\n${bank.bank_name}\nBRANCH: ${bank.branch}\nC/A A/C NO. ${bank.account_no}\nIFSC CODE: ${bank.ifsc}`;
    const sigBody = `Yours faithfully\n\n\nM.R. ENGINEERS${order.prepared_by ? `\n${order.prepared_by}` : ""}`;
    autoTable(doc, withPdfTableDefaults({
      startY: y,
      body: [[
        { content: bankBody, styles: { fontSize: 7.5, cellPadding: 1.6, valign: "top" } },
        { content: sigBody, styles: { fontSize: 7.5, cellPadding: 1.6, halign: "right", valign: "top", fontStyle: "bold" } },
      ]],
      theme: "grid",
      margin: { left: M, right: M },
      tableWidth: tableW,
      columnStyles: { 0: { cellWidth: tableW / 2 }, 1: { cellWidth: tableW / 2 } },
      styles: { lineColor: [0, 0, 0], lineWidth: 0.3 },
    }));
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

    // Footer address band (yellow strip)
    // Small right-aligned "M.R. ENGINEERS" label sitting just above the yellow strip
    autoTable(doc, withPdfTableDefaults({
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
    }));
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY;

    autoTable(doc, withPdfTableDefaults({
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
    }));
  }

  return doc;
}

/* ---------------------------------------------------------------------------
 * GMS PDF rendering (matches uploaded Union Agrotech / UGUR template)
 * -------------------------------------------------------------------------*/

interface GmsLayout { W: number; H: number; M: number }

const GMS_HEADER_H = 34; // mm — reserved space for the dual-logo banner
const GMS_TITLE_BAR_H = 7; // mm — grey "ORDER ACCEPTANCE" bar
const GMS_FOOTER_RESERVED = 38; // mm — reserved for HEAD OFFICE / Bank block

async function renderGmsPdf(
  doc: jsPDF,
  order: OrderRecord,
  opts: { terms?: string; bank?: BankDetails; gmsTerms?: GMSTerms; tcNote?: string; docMeta?: DocMetaOverride; currencyMode?: "INR" | "USD"; hiddenColumns?: PdfColumnKey[] } | undefined,
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

    // Left: GMS logo + caption (aspect-preserved fit)
    const logoTop = 3;
    const logoMaxH = 22;
    let leftLogoH = 0;
    if (gmsLogo) {
      try {
        const fit = fitInBox(gmsLogo.w, gmsLogo.h, 50, logoMaxH);
        doc.addImage(gmsLogo.dataUrl, "PNG", M, logoTop, fit.w, fit.h);
        leftLogoH = fit.h;
      } catch (e) { console.warn("gms logo", e); }
    }
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(9);
    doc.text("GRAIN MILLING SOLUTIONS PRIVATE LIMITED", M, logoTop + leftLogoH + 4);

    // Right: Uğur logo + caption + tagline (aspect-preserved fit)
    const rightX = W - M;
    let rightLogoH = 0;
    if (ugurLogo) {
      try {
        const fit = fitInBox(ugurLogo.w, ugurLogo.h, 45, logoMaxH);
        doc.addImage(ugurLogo.dataUrl, "PNG", rightX - fit.w, logoTop, fit.w, fit.h);
        rightLogoH = fit.h;
      } catch (e) { console.warn("ugur logo", e); }
    }
    const rightCaptionY = logoTop + Math.max(rightLogoH, leftLogoH) + 4;
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("UGUR MACHINE, TURKEY", rightX, rightCaptionY, { align: "right" });
    doc.setFont("helvetica", "italic").setFontSize(7);
    doc.text("Quality Standard is an Assurance of UGUR at all parts", rightX, rightCaptionY + 3.5, { align: "right" });

    // Grey "ORDER ACCEPTANCE" title bar directly under the header
    doc.setFillColor(200, 200, 200);
    doc.rect(M, GMS_HEADER_H, W - M * 2, GMS_TITLE_BAR_H, "F");
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(13);
    doc.text(opts?.docMeta?.title || "ORDER ACCEPTANCE", W / 2, GMS_HEADER_H + 5, { align: "center" });
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
    `${opts?.docMeta?.numberLabel || "OA No."}: ${opts?.docMeta?.numberValue || order.oa_number}`,
    `${opts?.docMeta?.refLabel || "Ref."} : ${opts?.docMeta?.refValue ?? (order.reference || order.cost_sheet_number || "-")}`,
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
  // EXW Turkey USD: prefer the independent turkey_pu_dollar_rate when > 0,
  // otherwise fall back to the cost-sheet fx_rate.
  const turkeyRate = (c.turkey_pu_dollar_rate || 0) > 0
    ? (c.turkey_pu_dollar_rate as number)
    : (c.fx_rate || 0);
  const turkeyAlwaysUSD =
    order.format === "GMS" && c.gms_mode === "EXW_TURKEY" && turkeyRate > 0;
  // EXW CIF Port — always USD using PU Dollar Rate.
  const isCifPort = order.format === "GMS" && c.gms_mode === "EXW_CIF_PORT";
  const cifRate = c.cif_pu_dollar_rate || 0;
  // Global GMS USD switch via PU Dollar Rate (excludes Turkey).
  const gmsUsd =
    order.format === "GMS" && cifRate > 0 && c.gms_mode !== "EXW_TURKEY";
  const usdDisplay = turkeyAlwaysUSD || gmsUsd;
  const usdRate = turkeyAlwaysUSD ? (turkeyRate || 1) : (gmsUsd ? cifRate : (c.fx_rate || 1));
  const turkeyCurLabel = "USD";
  const fmtUSD = (n: number) =>
    `$ ${(n / usdRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Toolbar-forced USD (values already converted in state — do NOT re-divide).
  const forcedUsd = order.format === "GMS" && opts?.currencyMode === "USD" && !usdDisplay;
  const fmtForcedUsd = (n: number) =>
    `$ ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtTotal = (n: number) =>
    usdDisplay ? fmtUSD(n) : forcedUsd ? fmtForcedUsd(n) : fmt(n);
  const showUsdLabel = usdDisplay || forcedUsd;

  // Dynamic columns — user may hide non-required cells in the PDF.
  let gmsCols = visibleColumns("GMS", opts?.hiddenColumns);
  const gmsCellFor = (k: PdfColumnKey, it: OrderRecord["line_items"][number], idx: number): string => {
    switch (k) {
      case "item_no":      return String(idx + 1);
      case "model_number": return ""; // not stored separately
      case "description":  return it.description || "";
      case "make":         return displayMake(it);
      case "qty":          return String(it.quantity);
      case "unit":         return it.unit || "Nos";
      case "rate":         return fmtTotal(it.unit_rate);
      case "amount":       return fmtTotal(it.amount);
      default:             return "";
    }
  };
  const gmsHeadFor = (k: PdfColumnKey): string => {
    switch (k) {
      case "item_no":      return "ITEM NO";
      case "model_number": return "MODEL NUMBER";
      case "description":  return "DESCRIPTION";
      case "make":         return "MAKE";
      case "qty":          return "QTY";
      case "unit":         return "UNIT";
      case "rate":         return `UNIT PRICE\n(${showUsdLabel ? "USD" : "INR"})`;
      case "amount":       return `AMOUNT\n(${showUsdLabel ? "USD" : "INR"})`;
    }
  };
  const gmsColWidthStyle: Record<PdfColumnKey, { cellWidth: number | "auto"; halign: "left" | "right" | "center" }> = {
    item_no:      { cellWidth: 16, halign: "center" },
    model_number: { cellWidth: 30, halign: "left" },
    description:  { cellWidth: "auto", halign: "left" },
    make:         { cellWidth: 22, halign: "center" },
    qty:          { cellWidth: 14, halign: "center" },
    unit:         { cellWidth: 14, halign: "center" },
    rate:         { cellWidth: 26, halign: "right" },
    amount:       { cellWidth: 28, halign: "right" },
  };
  // Auto-hide MODEL NUMBER when every row is empty (GMS doesn't store it
  // separately, so it otherwise reserves width and collides with ITEM NO).
  if (gmsCols.includes("model_number")) {
    const anyModel = order.line_items.some((it, i) => (gmsCellFor("model_number", it, i) || "").trim() !== "");
    if (!anyModel) gmsCols = gmsCols.filter((k) => k !== "model_number");
  }
  const itemRows = order.line_items.map((it, i) => gmsCols.map((k) => gmsCellFor(k, it, i)));

  const totalsRows: Array<{ label: string; value: number; bold?: boolean; inr?: boolean }> = [];
  if (isCifPort) {
    // USD-only CIF Port: Basic Total + Local Freight = EX Work CIF Port. No taxes/extras.
    const basicUsd = cifRate > 0 ? t.basic_total / cifRate : 0;
    const seaUsd = (c.cif_sea_freight_mode || "amount") === "percent"
      ? (basicUsd * (c.cif_sea_freight_percent || 0)) / 100
      : (c.cif_sea_freight_usd || 0);
    const grandUsd = basicUsd + seaUsd;
    const seaLabel = (c.cif_sea_freight_mode || "amount") === "percent"
      ? `Sea Freight @ ${c.cif_sea_freight_percent || 0}%`
      : "Sea Freight";
    // These rows go through fmtTotal which divides by usdRate — so we pass
    // INR-equivalent values (multiplying USD by usdRate) to keep one code path.
    totalsRows.push({ label: "Basic Total", value: basicUsd * usdRate });
    totalsRows.push({ label: seaLabel, value: seaUsd * usdRate });
    totalsRows.push({ label: "EX Work CIF Port", value: grandUsd * usdRate, bold: true });
  } else if (c.gms_mode === "EXW_TURKEY") {
    const tk = calcExTurkey(t.basic_total, c);
    totalsRows.push({ label: "Base Amount (EXW Turkey)", value: tk.base_amount });
    if (c.turkey_sea_freight_enabled) totalsRows.push({ label: "Sea Freight", value: tk.sea_freight });
    if (c.turkey_custom_enabled) totalsRows.push({ label: `Custom Duty${c.turkey_custom_percent ? ` @ ${c.turkey_custom_percent}%` : ""}`, value: tk.custom });
    if (c.turkey_landed_discount_enabled && tk.landed_discount > 0) {
      const lbl = (c.turkey_landed_discount_mode || "percent") === "percent" && c.turkey_landed_discount_percent
        ? `Discount @ ${c.turkey_landed_discount_percent}% on Landed`
        : "Discount on Landed";
      totalsRows.push({ label: lbl, value: -tk.landed_discount });
      totalsRows.push({ label: "Net Landed Price", value: tk.net_landed, bold: true });
    }
    if (c.turkey_insurance_enabled) {
      const lbl = (c.turkey_insurance_mode || "amount") === "percent" && c.turkey_insurance_percent
        ? `Insurance @ ${c.turkey_insurance_percent}%`
        : "Insurance";
      totalsRows.push({ label: lbl, value: tk.insurance });
    }
    if (c.turkey_pf_enabled) {
      const lbl = (c.turkey_pf_mode || "percent") === "percent" && c.turkey_pf_percent
        ? `P&F @ ${c.turkey_pf_percent}%`
        : "P&F";
      totalsRows.push({ label: lbl, value: tk.pf });
    }
    if (c.turkey_freight_enabled && tk.freight > 0) totalsRows.push({ label: "Freight", value: tk.freight });
    if (c.turkey_gst_enabled) totalsRows.push({ label: `GST${c.turkey_gst_percent ? ` @ ${c.turkey_gst_percent}%` : ""}`, value: tk.gst });
    if (c.turkey_discount_enabled && tk.discount > 0) {
      totalsRows.push({ label: "One-time Discount", value: -tk.discount });
    }
    if (c.turkey_advance_enabled && tk.advance_amount > 0) {
      const lbl = (c.turkey_advance_mode || "percent") === "percent" && c.turkey_advance_percent
        ? `Advance Adjustment @ ${c.turkey_advance_percent}%`
        : "Advance Adjustment";
      totalsRows.push({ label: lbl, value: tk.advance_amount });
      totalsRows.push({ label: "Net Payable", value: tk.net_payable, bold: true });
    } else if (c.turkey_discount_enabled && tk.discount > 0) {
      totalsRows.push({ label: "Net Payable", value: tk.net_payable, bold: true });
    }
  } else if (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) {
    const m = calcExMurthal(t.basic_total, c);
    totalsRows.push({ label: "Base Amount (EXW Turkey)", value: m.base_amount });
    if (c.sea_freight_enabled) totalsRows.push({ label: "Sea Freight", value: m.sea_freight });
    if (c.custom_enabled) totalsRows.push({ label: "Custom Duty", value: m.custom });
    if (c.clearing_enabled) totalsRows.push({ label: "Clearing Charge / CHA & Port", value: m.clearing });
    totalsRows.push({ label: "Landed Price", value: m.total_amount, bold: true });
    if (c.murthal_landed_discount_enabled && m.landed_discount_amount > 0) {
      const lbl = (c.murthal_landed_discount_mode || "percent") === "percent" && c.murthal_landed_discount_percent
        ? `Discount @ ${c.murthal_landed_discount_percent}% on Landed`
        : "Discount on Landed";
      totalsRows.push({ label: lbl, value: -m.landed_discount_amount });
      totalsRows.push({ label: "Net Landed Price", value: m.net_landed, bold: true });
    }
    const inrRate = m.landed_inr_rate || 0;
    const inrMode = inrRate > 0;
    if (inrMode) {
      totalsRows.push({ label: `Amount in INR @ ${inrRate}`, value: m.amount_in_inr, bold: true, inr: true });
    }
    if (c.sea_insurance_enabled) totalsRows.push({ label: "Insurance", value: m.sea_insurance, inr: inrMode });
    if ((c.murthal_pf_enabled || c.pf_amount > 0 || c.pf_percent > 0) && m.pf > 0) {
      totalsRows.push({ label: "P&F", value: m.pf, inr: inrMode });
    }
    if ((c.murthal_freight_enabled || c.freight_enabled) && m.freight > 0) {
      totalsRows.push({ label: "Freight", value: m.freight, inr: inrMode });
    }
    if (c.landed_gst_enabled) totalsRows.push({ label: "GST", value: m.gst, inr: inrMode });
    totalsRows.push({ label: "Grand Total", value: m.grand_total, bold: true, inr: inrMode });
    if (c.landed_discount_enabled && m.discount > 0) {
      totalsRows.push({ label: "One-time Discount", value: -m.discount, inr: inrMode });
    }
    if (c.murthal_advance_enabled && m.advance_amount > 0) {
      const lbl = (c.murthal_advance_mode || "percent") === "percent" && c.murthal_advance_percent
        ? `Advance Adjustment @ ${c.murthal_advance_percent}%`
        : "Advance Adjustment";
      totalsRows.push({ label: lbl, value: -m.advance_amount, inr: inrMode });
    }
    totalsRows.push({ label: "Net Payable", value: m.net_payable, bold: true, inr: inrMode });
  } else {
  totalsRows.push({ label: "Ex-works Murthal Price", value: t.basic_total });
  totalsRows.push({ label: "Grand Total", value: t.basic_total, bold: true });
  }
  if (!isCifPort && opts?.docMeta?.extraTotalsRows?.length) {
    for (const er of opts.docMeta.extraTotalsRows) {
      totalsRows.push({ label: er.label, value: er.value, bold: !!er.bold });
    }
  }

  const gmsLabelSpan = Math.max(1, gmsCols.length - 1);
  const totalsAsBody = totalsRows.map((r) => [
    {
      content: r.label,
      colSpan: gmsLabelSpan,
      styles: { halign: "right" as const, fontStyle: "bold" as const },
    },
    {
      content: r.inr ? `Rs. ${(r.value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmtTotal(r.value),
      styles: {
        halign: "right" as const,
        fontStyle: (r.bold ? "bold" : "normal") as "bold" | "normal",
      },
    },
  ]);

  // (Conversion banners intentionally omitted from print/PDF view per spec.)

  const gmsColumnStyles: Record<number, { cellWidth: number | "auto"; halign?: "left" | "right" | "center" }> = {};
  gmsCols.forEach((k, i) => { gmsColumnStyles[i] = gmsColWidthStyle[k]; });
  autoTable(doc, withPdfTableDefaults({
    startY: y,
    head: [gmsCols.map(gmsHeadFor)],
    body: [...itemRows, ...totalsAsBody as never[]],
    theme: "grid",
    tableWidth: W - M * 2,
    styles: {
      fontSize: 7.5, cellPadding: 2.2, minCellHeight: 7,
      lineColor: [0, 0, 0], lineWidth: 0.2, valign: "middle",
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [220, 220, 220], textColor: [0, 0, 0],
      halign: "center", valign: "middle", fontStyle: "bold",
      lineColor: [0, 0, 0], lineWidth: 0.3, cellPadding: 2, minCellHeight: 8,
    },
    columnStyles: gmsColumnStyles,
    margin: { left: M, right: M, top: GMS_HEADER_H + GMS_TITLE_BAR_H + 4, bottom: GMS_FOOTER_RESERVED },
    didDrawPage: () => { drawHeader(); },
  }));

  // @ts-expect-error lastAutoTable runtime
  let yEnd = doc.lastAutoTable.finalY + 6;

  // EXW CIF Port — print USD amount in words below the totals table.
  if (isCifPort && cifRate > 0) {
    const basicUsd = t.basic_total / cifRate;
    const seaUsd = (c.cif_sea_freight_mode || "amount") === "percent"
      ? (basicUsd * (c.cif_sea_freight_percent || 0)) / 100
      : (c.cif_sea_freight_usd || 0);
    const grandUsd = basicUsd + seaUsd;
    if (grandUsd > 0) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const words = `AMOUNT (IN WORDS): ${amountInWordsUSD(grandUsd)}`;
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  }
  // EXW Murthal — when "Amount in INR" rate set, Net Payable is INR — words in Rs.
  if ((c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) && (c.murthal_landed_inr_rate || 0) > 0) {
    const m = calcExMurthal(t.basic_total, c);
    if (m.net_payable > 0) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const words = `AMOUNT (IN WORDS): ${amountInWords(m.net_payable).replace(/^INR\s*/i, "RS. ")}`;
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  } else if (gmsUsd && (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) && cifRate > 0) {
    const m = calcExMurthal(t.basic_total, c);
    const np = m.net_payable / cifRate;
    if (np > 0) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const words = `AMOUNT (IN WORDS): ${amountInWordsUSD(np)}`;
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  }
  // EXW Murthal — toolbar-forced USD path (values already in USD in state).
  if (forcedUsd && (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) && !((c.murthal_landed_inr_rate || 0) > 0)) {
    const m = calcExMurthal(t.basic_total, c);
    if (m.net_payable > 0) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const words = `AMOUNT (IN WORDS): ${amountInWordsUSD(m.net_payable)}`;
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  }
  // EXW Murthal — INR mode: print Rupees amount in words for net payable.
  if (
    !forcedUsd && !gmsUsd &&
    (c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) &&
    !((c.murthal_landed_inr_rate || 0) > 0)
  ) {
    const m = calcExMurthal(t.basic_total, c);
    if (m.net_payable > 0 && order.amount_in_words) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const words = `AMOUNT (IN WORDS): ${order.amount_in_words.replace(/^INR\s*/i, "RS. ")}`;
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  }
  // Default GMS branch (no special mode) — print amount-in-words honouring
  // the active currency mode (toolbar-forced USD, PU Dollar Rate USD, or INR).
  if (
    !isCifPort &&
    c.gms_mode !== "EXW_TURKEY" &&
    !(c.gms_mode === "EXW_MURTHAL" || c.ex_murthal_enabled) &&
    t.basic_total > 0
  ) {
    let words = "";
    if (forcedUsd) {
      words = `AMOUNT (IN WORDS): ${amountInWordsUSD(t.basic_total)}`;
    } else if (gmsUsd && cifRate > 0) {
      words = `AMOUNT (IN WORDS): ${amountInWordsUSD(t.basic_total / cifRate)}`;
    } else if (order.amount_in_words) {
      words = `AMOUNT (IN WORDS): ${order.amount_in_words.replace(/^INR\s*/i, "RS. ")}`;
    }
    if (words) {
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
      const wrapped = doc.splitTextToSize(words, W - M * 2);
      wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
      yEnd += 3;
    }
  }
  // EXW Turkey — print Grand Total in words. Currency follows display mode:
  // USD when turkey_pu_dollar_rate or fx_rate is set (totals shown in $),
  // otherwise INR. Uses Net Payable when an advance/discount is applied.
  if (c.gms_mode === "EXW_TURKEY" && t.basic_total > 0) {
    const tk = calcExTurkey(t.basic_total, c);
    const showNetPayable =
      (c.turkey_advance_enabled && tk.advance_amount > 0) ||
      (c.turkey_discount_enabled && tk.discount > 0);
    const inrValue = showNetPayable ? tk.net_payable : tk.grand_total;
    if (inrValue > 0) {
      const turkeyDisplayUSD = (turkeyRate || 0) > 0;
      const words = turkeyDisplayUSD
        ? `AMOUNT (IN WORDS): ${amountInWordsUSD(inrValue / (turkeyRate || 1))}`
        : `AMOUNT (IN WORDS): ${amountInWords(inrValue).replace(/^INR\s*/i, "RS. ")}`;
      {
        doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0);
        const wrapped = doc.splitTextToSize(words, W - M * 2);
        wrapped.forEach((line: string) => { doc.text(line, M, yEnd); yEnd += 4; });
        yEnd += 3;
      }
    }
  }

  if (!opts?.docMeta?.hideFirstPageFooter) {
    // If footer block won't fit on the current page, push to a new one
    if (yEnd + GMS_FOOTER_RESERVED > H - M) {
      doc.addPage();
      drawHeader();
      yEnd = GMS_HEADER_H + GMS_TITLE_BAR_H + 8;
    }
    drawFooterBlock(yEnd);
  }

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

  // Optional free-form note printed only when set.
  const tcNote = (opts?.tcNote || (order as unknown as { tc_note?: string }).tc_note || "").trim();
  if (tcNote) {
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("Note :", M, yT); yT += 5;
    doc.setFont("helvetica", "normal").setFontSize(9);
    const wrapped = doc.splitTextToSize(tcNote, W - M * 2);
    wrapped.forEach((w: string) => { doc.text(w, M, yT); yT += 4.5; });
    yT += 3;
  }

  // When the page-1 footer was suppressed, surface the exclusions + FX line here
  if (opts?.docMeta?.hideFirstPageFooter) {
    doc.setFont("helvetica", "bold").setFontSize(9);
    DEFAULT_GMS_EXCLUSIONS.forEach((line) => { doc.text(line, M, yT); yT += 4.5; });
    const fxRate = order.charges.fx_rate || 0;
    const currency = order.charges.currency || "INR";
    if (fxRate > 0 && currency !== "INR") {
      doc.text(
        `${currency} conversion rate - @Rs${fxRate}. Any variation in exchange rate will be borne by client.`,
        M, yT,
      );
      yT += 4.5;
    }
    yT += 3;
  }

  // Footer block on T&C page (anchored near bottom)
  const footerStart = Math.max(yT + 4, H - GMS_FOOTER_RESERVED);
  drawFooterBlock(footerStart);
}

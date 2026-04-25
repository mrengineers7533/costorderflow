import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { OrderRecord } from "./types";
import { DEFAULT_MR_BANK, DEFAULT_MR_TERMS, MR_FOOTER_ADDRESS, type BankDetails } from "./defaults";

const COMPANY_MR = {
  name: "MR ENGINEERS PVT. LTD.",
  address: "Plot No. 7, Sector-3, IMT Manesar, Gurgaon - 122051, Haryana, India",
  gstin: "06AABCM3429K1ZP",
  phone: "+91-124-4374444",
  email: "info@mrengineers.com",
};
const COMPANY_GMS = {
  name: "GMS ENGINEERING",
  address: "IMT Manesar, Gurgaon, Haryana, India",
  gstin: "—",
  phone: "+91-124-0000000",
  email: "info@gmsengg.com",
};

export function generateOrderPDF(order: OrderRecord, opts?: { terms?: string; bank?: BankDetails }): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const company = order.format === "MR" ? COMPANY_MR : COMPANY_GMS;
  const accent: [number, number, number] = order.format === "MR" ? [37, 99, 235] : [22, 163, 74];

  let y = M;

  // Header banner
  doc.setFillColor(...accent);
  doc.rect(0, 0, W, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text(company.name, M, 10);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(company.address, M, 15);
  doc.text(`GSTIN: ${company.gstin}  |  ${company.phone}  |  ${company.email}`, M, 19);

  y = 28;
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

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["S.No.", "Item Description", "HSN", "Qty", "Unit Rate (INR)", "Amount (INR)"]],
    body: order.line_items.map((it, i) => [
      String(i + 1),
      it.description,
      it.hsn_code || "-",
      String(it.quantity),
      it.unit_rate.toFixed(2),
      it.amount.toFixed(2),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: accent, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable is added at runtime by autoTable
  y = doc.lastAutoTable.finalY + 4;

  // Totals box (right aligned)
  const tBoxW = 80;
  const tx = W - M - tBoxW;
  const c = order.charges;
  const t = order.totals;
  const rows: [string, string][] = [
    ["Basic Total", t.basic_total.toFixed(2)],
    ["P&F" + (c.pf_percent ? ` (${c.pf_percent}%)` : ""), ((c.pf_percent ? (t.basic_total * c.pf_percent) / 100 : c.pf_amount) || 0).toFixed(2)],
    ["Insurance", (c.insurance || 0).toFixed(2)],
  ];
  if (c.freight_enabled) rows.push(["Freight", (c.freight || 0).toFixed(2)]);
  rows.push(["Subtotal", t.subtotal.toFixed(2)]);
  rows.push([`GST${c.gst_percent ? ` (${c.gst_percent}%)` : ""}`, (c.gst_amount ?? (t.subtotal * (c.gst_percent || 0)) / 100).toFixed(2)]);
  rows.push(["Grand Total", t.grand_total.toFixed(2)]);
  if (c.discount) rows.push(["Special Discount", `-${c.discount.toFixed(2)}`]);
  rows.push(["Net Payable", t.net_payable.toFixed(2)]);

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "plain",
    margin: { left: tx, right: M },
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: "bold" },
      1: { cellWidth: 35, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.row.index === rows.length - 1 || rows[data.row.index][0] === "Grand Total") {
        data.cell.styles.fillColor = [240, 240, 240];
        data.cell.styles.fontStyle = "bold";
      }
    },
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

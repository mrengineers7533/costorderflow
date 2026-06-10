import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface PoPdfRow {
  lot: string;
  material: string;
  size: string;
  make: string;
  qty: string;
  unit: string;
}

export interface PoPdfContext {
  poNumber: string;
  category: "steel" | "machine" | "3p";
  vendorName: string;
  vendorContact?: string;
  lots: string[];
  notes?: string;
  rows: PoPdfRow[];
  createdAt: string;
}

const catLabel: Record<PoPdfContext["category"], string> = {
  steel: "Steel",
  machine: "Machine",
  "3p": "3P / Outside Purchase",
};

export function generatePoPDF(ctx: PoPdfContext): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("PURCHASE ORDER", W / 2, 16, { align: "center" });

  doc.setFont("helvetica", "normal").setFontSize(9);
  const headerLeft = [
    `PO No: ${ctx.poNumber}`,
    `Category: ${catLabel[ctx.category]}`,
    `Date: ${new Date(ctx.createdAt).toLocaleDateString("en-IN")}`,
    `Lot(s): ${ctx.lots.join(", ") || "—"}`,
  ];
  const headerRight = [
    `Vendor: ${ctx.vendorName}`,
    ctx.vendorContact ? `Contact: ${ctx.vendorContact}` : "",
  ].filter(Boolean);

  headerLeft.forEach((l, i) => doc.text(l, M, 26 + i * 5));
  headerRight.forEach((l, i) => doc.text(l, W / 2, 26 + i * 5));

  autoTable(doc, {
    startY: 26 + headerLeft.length * 5 + 4,
    head: [["#", "Lot", "Material", "Size / Model", "Make", "Qty", "Unit"]],
    body: ctx.rows.map((r, i) => [
      String(i + 1),
      r.lot,
      r.material,
      r.size,
      r.make,
      r.qty,
      r.unit,
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: M, right: M },
  });

  if (ctx.notes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? 80;
    doc.setFont("helvetica", "bold").text("Notes:", M, finalY + 10);
    doc.setFont("helvetica", "normal").text(ctx.notes, M, finalY + 15, { maxWidth: W - 2 * M });
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
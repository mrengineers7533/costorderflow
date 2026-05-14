import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BoqRecord } from "./types";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";

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

function fitInBox(natW: number, natH: number, maxW: number, maxH: number) {
  const r = Math.min(maxW / natW, maxH / natH);
  return { w: natW * r, h: natH * r };
}

export async function generateBoqPDF(boq: BoqRecord): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  let y = M;

  // Header — match OA visual language per format
  if (boq.format === "MR") {
    const accent: [number, number, number] = [234, 88, 12];
    const headerH = 26;
    const logo = await loadLogo(mrLogoUrl);
    if (logo) {
      try {
        const fit = fitInBox(logo.w, logo.h, 60, 20);
        doc.addImage(logo.dataUrl, "PNG", M, 3, fit.w, fit.h);
      } catch (e) { console.warn("addImage", e); }
    }
    const rightX = W - M;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold").setFontSize(18);
    doc.text("M.R. Engineers", rightX, 9, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text("*  ENGINEERS    *  CONTRACTORS    *  SUPPLIERS", rightX, 14, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text("Shed No. 33, HSIIDC, Murthal, Sonepat.", rightX, 18, { align: "right" });
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text("GSTIN-06AARPM1849G1ZF", rightX, 22, { align: "right" });
    doc.setDrawColor(...accent).setLineWidth(0.6);
    doc.line(0, headerH, W, headerH);
    y = headerH + 6;
  } else {
    // GMS dual-logo header
    const headerH = 34;
    const gmsLogo = await loadLogo(gmsLogoUrl);
    const ugurLogo = await loadLogo(ugurLogoUrl);
    let leftLogoH = 0, rightLogoH = 0;
    if (gmsLogo) {
      try {
        const fit = fitInBox(gmsLogo.w, gmsLogo.h, 50, 22);
        doc.addImage(gmsLogo.dataUrl, "PNG", M, 3, fit.w, fit.h);
        leftLogoH = fit.h;
      } catch (e) { console.warn(e); }
    }
    doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(9);
    doc.text("GRAIN MILLING SOLUTIONS PRIVATE LIMITED", M, 3 + leftLogoH + 4);
    const rightX = W - M;
    if (ugurLogo) {
      try {
        const fit = fitInBox(ugurLogo.w, ugurLogo.h, 45, 22);
        doc.addImage(ugurLogo.dataUrl, "PNG", rightX - fit.w, 3, fit.w, fit.h);
        rightLogoH = fit.h;
      } catch (e) { console.warn(e); }
    }
    const capY = 3 + Math.max(leftLogoH, rightLogoH) + 4;
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text("UGUR MACHINE, TURKEY", rightX, capY, { align: "right" });
    doc.setFont("helvetica", "italic").setFontSize(7);
    doc.text("Quality Standard is an Assurance of UGUR at all parts", rightX, capY + 3.5, { align: "right" });
    y = headerH;
  }

  // BOQ title bar
  doc.setFillColor(200, 200, 200);
  doc.rect(M, y, W - M * 2, 7, "F");
  doc.setTextColor(0, 0, 0).setFont("helvetica", "bold").setFontSize(13);
  doc.text("BOQ", W / 2, y + 5, { align: "center" });
  y += 11;

  // Header meta — two-column layout
  doc.setFontSize(9);
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB").replace(/\//g, "-");
  const leftRows: [string, string][] = [
    ["BOQ No.", boq.boq_number + (boq.version > 1 ? `  (v${boq.version})` : "")],
    ["Order Acceptance No.", boq.reference_oa_number || "-"],
  ];
  const rightRows: [string, string][] = [
    ["Date", fmtDate(boq.boq_date)],
    ["Prepared By", boq.prepared_by || "-"],
    ["Project / Cost Sheet No.", boq.project_number || "-"],
  ];
  leftRows.forEach((row, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${row[0]}:`, M, y + i * 5);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], M + 42, y + i * 5);
  });
  rightRows.forEach((row, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${row[0]}:`, W / 2 + 5, y + i * 5);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], W / 2 + 50, y + i * 5);
  });
  y += leftRows.length * 5 + 4;

  // Items table — only the 6 BOQ columns (no pricing!)
  const rows = boq.line_items.map((it, i) => [
    it.item_no || String(i + 1),
    it.model_number || "",
    it.description || "",
    it.quantity ? String(it.quantity) : "",
    it.unit || "",
    it.remarks || "",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "QTY", "UNIT", "Remarks"]],
    body: rows.length ? rows : [["", "", "(no items)", "", "", ""]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [0, 0, 0], lineWidth: 0.2, valign: "top" },
    headStyles: { fillColor: boq.format === "MR" ? [234, 88, 12] : [120, 120, 120], textColor: 255, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: 32 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 50 },
    },
    margin: { left: M, right: M },
  });

  // @ts-expect-error lastAutoTable runtime
  y = doc.lastAutoTable.finalY + 6;

  // Terms & Conditions
  if (boq.terms && boq.terms.trim()) {
    autoTable(doc, {
      startY: y,
      body: [[{
        content: `TERMS & CONDITIONS:\n${boq.terms}`,
        styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.3, lineColor: [0, 0, 0] },
      }]],
      theme: "plain",
      margin: { left: M, right: M },
      tableWidth: W - M * 2,
    });
    // @ts-expect-error lastAutoTable runtime
    y = doc.lastAutoTable.finalY + 4;
  }

  if (boq.notes && boq.notes.trim()) {
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text("Notes:", M, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(boq.notes, W - M * 2 - 14), M + 14, y);
  }

  return doc;
}
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import type { FieldMap, FieldMapKey, OrderRecord, OrderTemplate } from "./types";

function fmt(n: number | undefined | null) {
  return (n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function valueFor(key: FieldMapKey, o: OrderRecord): string {
  switch (key) {
    case "oa_number": return o.oa_number;
    case "order_date": return new Date(o.order_date).toLocaleDateString("en-IN");
    case "reference": return o.reference || "";
    case "cost_sheet_number": return o.cost_sheet_number || "";
    case "prepared_by": return o.prepared_by || "";
    case "company_name": return o.company_name || o.bill_to.name || "";
    case "bill_to_name": return o.bill_to.name || "";
    case "bill_to_address": return o.bill_to.address || "";
    case "bill_to_gstin": return o.bill_to.gstin || "";
    case "bill_to_state": return o.bill_to.state || "";
    case "ship_to_name": return o.ship_to.name || "";
    case "ship_to_address": return o.ship_to.address || "";
    case "ship_to_gstin": return o.ship_to.gstin || "";
    case "ship_to_state": return o.ship_to.state || "";
    case "basic_total": return fmt(o.totals.basic_total);
    case "pf_amount": {
      const c = o.charges;
      const pf = c.pf_percent ? (o.totals.basic_total * c.pf_percent) / 100 : (c.pf_amount || 0);
      return fmt(pf);
    }
    case "insurance": return fmt(o.charges.insurance);
    case "freight": return fmt(o.charges.freight);
    case "subtotal": return fmt(o.totals.subtotal);
    case "gst_amount": {
      const gst = o.charges.gst_amount || (o.totals.subtotal * (o.charges.gst_percent || 0)) / 100;
      return fmt(gst);
    }
    case "grand_total": return fmt(o.totals.grand_total);
    case "discount": return fmt(o.charges.discount);
    case "net_payable": return fmt(o.totals.net_payable);
    case "amount_in_words": return o.amount_in_words || "";
    case "notes": return o.notes || "";
    default: return "";
  }
}

export async function fetchTemplate(format: "MR" | "GMS"): Promise<OrderTemplate | null> {
  const { data, error } = await supabase
    .from("order_templates")
    .select("*")
    .eq("format", format)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as OrderTemplate;
}

export function publicTemplateUrl(filePath: string): string {
  const { data } = supabase.storage.from("order-templates").getPublicUrl(filePath);
  return data.publicUrl;
}

/** Render order data on top of an uploaded template PDF using the saved field map. */
export async function generateOrderPDFFromTemplate(
  order: OrderRecord,
  template: OrderTemplate
): Promise<Uint8Array> {
  const url = publicTemplateUrl(template.file_path);
  const bytes = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load template: ${r.status}`);
    return r.arrayBuffer();
  });
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const map: FieldMap = template.field_map || {};

  const drawText = (
    text: string,
    placement: { page: number; x: number; y: number; width?: number; fontSize?: number; align?: string; bold?: boolean }
  ) => {
    const pageIdx = Math.max(0, Math.min(pages.length - 1, (placement.page || 1) - 1));
    const page = pages[pageIdx];
    const { width: pw, height: ph } = page.getSize();
    const size = placement.fontSize || 10;
    const useFont = placement.bold ? fontBold : font;
    const maxWidth = placement.width ? placement.width * pw : pw - placement.x * pw - 10;
    const lines = wrapText(text, useFont, size, maxWidth);
    const lineHeight = size * 1.2;
    lines.forEach((line, i) => {
      const textW = useFont.widthOfTextAtSize(line, size);
      let x = placement.x * pw;
      if (placement.align === "right") x = (placement.x + (placement.width || 0)) * pw - textW;
      else if (placement.align === "center") x = placement.x * pw + ((placement.width || 0) * pw - textW) / 2;
      const y = ph - placement.y * ph - size - i * lineHeight;
      page.drawText(line, { x, y, size, font: useFont, color: rgb(0, 0, 0) });
    });
  };

  // Draw simple text fields
  (Object.keys(map) as FieldMapKey[]).forEach((key) => {
    if (key === "items_table") return;
    const placement = map[key];
    if (!placement) return;
    const text = valueFor(key, order);
    if (!text) return;
    drawText(text, placement);
  });

  // Draw items table
  const tablePlacement = map.items_table;
  if (tablePlacement && order.line_items.length) {
    const pageIdx = Math.max(0, Math.min(pages.length - 1, (tablePlacement.page || 1) - 1));
    const page = pages[pageIdx];
    const { width: pw, height: ph } = page.getSize();
    const size = tablePlacement.fontSize || 9;
    const x0 = tablePlacement.x * pw;
    const totalW = (tablePlacement.width || 0.9) * pw;
    // Columns: SNo (5%), Desc (50%), HSN (10%), Qty (10%), Rate (12.5%), Amount (12.5%)
    const colW = [0.05, 0.5, 0.1, 0.1, 0.125, 0.125].map((p) => p * totalW);
    const colX = colW.reduce<number[]>((acc, w, i) => { acc.push(i === 0 ? x0 : acc[i - 1] + colW[i - 1]); return acc; }, []);
    const lineH = size * 1.5;
    let y = ph - tablePlacement.y * ph - size;
    order.line_items.forEach((it, i) => {
      const rowYTop = y;
      const cells = [
        String(i + 1),
        it.description,
        it.hsn_code || "-",
        String(it.quantity),
        fmt(it.unit_rate),
        fmt(it.amount),
      ];
      const wraps = cells.map((c, ci) => wrapText(c, font, size, colW[ci] - 4));
      const rowLines = Math.max(...wraps.map((w) => w.length));
      wraps.forEach((lines, ci) => {
        lines.forEach((line, li) => {
          const tw = font.widthOfTextAtSize(line, size);
          const align = ci >= 3 ? "right" : ci === 0 ? "center" : "left";
          let cx = colX[ci] + 2;
          if (align === "right") cx = colX[ci] + colW[ci] - tw - 2;
          if (align === "center") cx = colX[ci] + (colW[ci] - tw) / 2;
          page.drawText(line, { x: cx, y: rowYTop - li * lineH, size, font, color: rgb(0, 0, 0) });
        });
      });
      y -= rowLines * lineH + 2;
    });
  }

  return pdfDoc.save();
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [];
  const paragraphs = String(text).split(/\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = "";
    for (const w of words) {
      const trial = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
      else { if (line) out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
import { createRoot } from "react-dom/client";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { amountInWords } from "./calc";
import { DEFAULT_GMS_BANK, DEFAULT_GMS_TERMS, DEFAULT_MR_BANK, DEFAULT_MR_TERMS } from "./defaults";
import { capturePreviewToPdf, ORDER_PREVIEW_PDF_WIDTH_PX } from "./previewPdf";
import type { ComponentProps } from "react";
import type { BankDetails, GMSTerms } from "./defaults";
import type { OrderRecord } from "./types";
import type { PdfColumnKey } from "./pdfColumns";

export interface ExportOrderPreviewPdfOptions {
  terms?: string;
  bank?: BankDetails;
  gmsTerms?: GMSTerms;
  currencyMode?: "INR" | "USD";
  hiddenColumns?: PdfColumnKey[];
  save?: boolean;
}

type OrderPreviewProps = ComponentProps<typeof OrderPreview>;

/**
 * Render an OrderPreview OFF-SCREEN in export mode and rasterise it to PDF.
 * The on-screen Live Preview is never touched or re-rendered — callers pass
 * the same props their visible preview uses.
 */
export async function renderOrderPreviewPdf(
  props: OrderPreviewProps,
  filename: string,
  options: { save?: boolean } = {},
): Promise<{ ok: true; blob: Blob } | { ok: false }> {
  if (typeof document === "undefined") return { ok: false };

  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-12000px",
    "top:0",
    `width:${ORDER_PREVIEW_PDF_WIDTH_PX}px`,
    "background:#fff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    root.render(
      <OrderPreview
        {...props}
        parsing={false}
        onFormatChange={undefined}
        onDownloadPDF={undefined}
        exportMode
      />,
    );

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const previewRoot = host.querySelector<HTMLElement>("[data-oa-preview-root]");
    return capturePreviewToPdf(previewRoot, filename, { save: options.save });
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * Export an OA/PI PDF from the same React preview template users see in Live
 * Preview. This keeps list/revision/programmatic downloads aligned with the
 * editor download path and avoids the legacy jsPDF/autoTable layout drift.
 */
export async function exportOrderPreviewPdf(
  order: OrderRecord,
  filename?: string,
  options: ExportOrderPreviewPdfOptions = {},
): Promise<{ ok: true; blob: Blob } | { ok: false }> {
  if (typeof document === "undefined") return { ok: false };

  const safe = filename || `${(order.oa_number || "OA").replace(/[/\\]/g, "_")}.pdf`;

  return renderOrderPreviewPdf(
    {
      oaNumber: order.oa_number,
      format: order.format,
      companyName: order.company_name || "",
      billTo: order.bill_to || {},
      shipTo: order.ship_to || order.bill_to || {},
      sameAsBill: false,
      reference: order.reference || "",
      costSheetNumber: order.cost_sheet_number || "",
      orderDate: order.order_date,
      preparedBy: order.prepared_by || "",
      items: order.line_items || [],
      charges: order.charges,
      totals: order.totals,
      amountInWords: order.amount_in_words || amountInWords(order.totals?.net_payable || 0),
      notes: order.notes || "",
      terms: options.terms ?? DEFAULT_MR_TERMS,
      bank: options.bank ?? (order.format === "GMS" ? DEFAULT_GMS_BANK : DEFAULT_MR_BANK),
      gmsTerms: options.gmsTerms ?? DEFAULT_GMS_TERMS,
      currencyMode: options.currencyMode,
      hiddenColumns: options.hiddenColumns,
    },
    safe,
    { save: options.save },
  );
}

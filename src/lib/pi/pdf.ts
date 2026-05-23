import jsPDF from "jspdf";
import { generateOrderPDF, type ExtraTotalsRow } from "@/lib/orders/pdf";
import type { PdfColumnKey } from "@/lib/orders/pdfColumns";
import type { OrderRecord } from "@/lib/orders/types";
import type { PiRecord } from "./types";
import { calcPiTotals } from "./calc";
import { buildClientCopyItems } from "@/lib/orders/clientCopy";
import { DEFAULT_MR_BANK, DEFAULT_MR_TERMS, DEFAULT_GMS_TERMS, type BankDetails, type GMSTerms } from "@/lib/orders/defaults";

/**
 * Generates a Proforma Invoice PDF reusing the OA template.
 * - Title swapped to "PROFORMA INVOICE"
 * - "OA Number" → "PI No."
 * - "Reference" → "Ref. OA No."
 * - Adds One-Time Discount %, Advance Adjustment %, Net Payable rows
 */
export async function generatePiPDF(
  pi: PiRecord,
  opts?: { terms?: string; bank?: BankDetails; gmsTerms?: GMSTerms; currencyMode?: "INR" | "USD"; hiddenColumns?: PdfColumnKey[] },
): Promise<jsPDF> {
  // Map PI → OrderRecord-shape so we can reuse generateOrderPDF.
  // Items are rendered in Client-Copy grouped form (MHE / Fan / Magnet /
  // Spouting consolidated) — calculations still use pi.line_items below.
  const displayItems = buildClientCopyItems(pi.line_items || []);
  const orderLike: OrderRecord = {
    id: pi.id,
    user_id: pi.user_id || "",
    oa_number: pi.pi_number,
    format: pi.format,
    status: pi.status,
    company_name: pi.company_name,
    bill_to: pi.bill_to,
    ship_to: pi.ship_to,
    reference: pi.reference_oa_number || null,
    cost_sheet_number: null,
    order_date: pi.pi_date,
    prepared_by: pi.prepared_by,
    line_items: displayItems,
    charges: pi.charges,
    totals: pi.totals,
    amount_in_words: pi.amount_in_words,
    notes: pi.notes,
    created_at: pi.created_at,
    updated_at: pi.updated_at,
  };

  const advMode = pi.advance_mode || "percent";
  const advValue = advMode === "amount"
    ? (pi.advance_amount || 0)
    : (pi.advance_adjustment_percent || 0);
  const t = calcPiTotals(
    pi.line_items,
    pi.charges,
    pi.one_time_discount_percent,
    { mode: advMode, value: advValue },
    pi.other_charges || 0,
  );
  // PI-level overrides applied on TOP of the OA grand total (mirrors editor).
  const grandForPi = t.gross_invoice_total;
  const piAdvOnGrand = advMode === "amount"
    ? Math.max(0, pi.advance_amount || 0)
    : Math.max(0, (grandForPi * (pi.advance_adjustment_percent || 0)) / 100);
  const piDiscMode = pi.discount_mode || "percent";
  const piDiscValue = pi.discount_value || 0;
  const piDiscAmt = piDiscMode === "amount"
    ? Math.max(0, piDiscValue)
    : Math.max(0, (grandForPi * piDiscValue) / 100);
  const piNet = Math.max(0, grandForPi - piAdvOnGrand - piDiscAmt);

  const extraTotalsRows: ExtraTotalsRow[] = [];
  const isCifPort = pi.format === "GMS" && pi.charges.gms_mode === "EXW_CIF_PORT";
  // EXW CIF Port shows USD-only totals from the OA-PDF branch — skip discount/advance/other rows.
  if (isCifPort) {
    return generateOrderPDF(orderLike, {
      terms: opts?.terms,
      bank: opts?.bank,
      gmsTerms: opts?.gmsTerms ?? DEFAULT_GMS_TERMS,
      currencyMode: opts?.currencyMode,
      hiddenColumns: opts?.hiddenColumns,
      docMeta: {
        title: "Proforma Invoice",
        numberLabel: "PI No.",
        numberValue: pi.pi_number,
        refLabel: "Ref. OA No.",
        refValue: pi.reference_oa_number || "-",
        extraTotalsRows: [],
        hideFirstPageFooter: true,
      },
    });
  }
  const showDiscount =
    (pi.apply_discount ?? (pi.one_time_discount_percent > 0)) &&
    t.one_time_discount_amount > 0;
  const discountLabel = pi.format === "MR"
    ? "Discount on Basic Total"
    : ((pi.discount_label || "One Time Very Special Discount").trim()
        || "One Time Very Special Discount");
  const afterDiscountLabel = pi.format === "MR" ? "After Discount Amount" : "After Discount";
  if (showDiscount) {
    extraTotalsRows.push({
      label: discountLabel,
      value: t.one_time_discount_amount,
    });
    extraTotalsRows.push({
      label: afterDiscountLabel,
      value: t.basic_after_discount,
    });
  }
  if (t.other_charges_amount > 0) {
    extraTotalsRows.push({ label: "Other Charges", value: t.other_charges_amount });
  }
  if (piDiscAmt > 0) {
    const dLabel = piDiscMode === "amount"
      ? "Discount"
      : `Discount @ ${piDiscValue}%`;
    extraTotalsRows.push({ label: dLabel, value: piDiscAmt });
  }
  if (piAdvOnGrand > 0) {
    const advLabel = advMode === "amount"
      ? "Advance Adjustment"
      : `Advance Adjustment @ ${pi.advance_adjustment_percent}%`;
    extraTotalsRows.push({ label: advLabel, value: piAdvOnGrand });
  }
  if (piAdvOnGrand > 0 || piDiscAmt > 0) {
    extraTotalsRows.push({ label: "Net Payable", value: piNet, bold: true });
  }

  return generateOrderPDF(orderLike, {
    terms: opts?.terms ?? (pi.format === "MR" ? DEFAULT_MR_TERMS : undefined),
    bank: opts?.bank ?? (pi.format === "MR" ? DEFAULT_MR_BANK : undefined),
    gmsTerms: opts?.gmsTerms ?? (pi.format === "GMS" ? DEFAULT_GMS_TERMS : undefined),
    currencyMode: opts?.currencyMode,
    hiddenColumns: opts?.hiddenColumns,
    docMeta: {
      title: "Proforma Invoice",
      numberLabel: pi.format === "MR" ? "PI Number" : "PI No.",
      numberValue: pi.pi_number,
      refLabel: "Ref. OA No.",
      refValue: pi.reference_oa_number || "-",
      extraTotalsRows,
      hideFirstPageFooter: pi.format === "GMS",
    },
  });
}
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";
import { calcExMurthal, calcExTurkey, amountInWordsUSD, amountInWords, displayMake } from "@/lib/orders/calc";
import { visibleColumns, type PdfColumnKey } from "@/lib/orders/pdfColumns";
import mrLogo from "@/assets/mr-logo.png";
import gmsLogo from "@/assets/gms-logo.png";
import ugurLogo from "@/assets/ugur-logo.png";
import mrStamp from "@/assets/mr-stamp.png";
import {
  MR_FOOTER_ADDRESS,
  GMS_HEAD_OFFICE_LINES,
  DEFAULT_GMS_BANK,
  DEFAULT_GMS_EXCLUSIONS,
  CURRENCY_SYMBOLS,
  type BankDetails,
  type GMSTerms,
} from "@/lib/orders/defaults";

interface Props {
  oaNumber: string;
  format: OrderFormat;
  companyName: string;
  billTo: Address;
  shipTo: Address;
  sameAsBill: boolean;
  reference: string;
  costSheetNumber: string;
  orderDate: string;
  preparedBy: string;
  items: LineItem[];
  charges: Charges;
  totals: Totals;
  amountInWords: string;
  notes: string;
  parsing?: boolean;
  onFormatChange?: (f: OrderFormat) => void;
  onDownloadPDF?: () => void;
  splitMode?: boolean;
  terms?: string;
  bank?: BankDetails;
  gmsTerms?: GMSTerms;
  /** Toolbar-driven currency mode for GMS OA/PI: when "USD", treat the
   *  underlying line-item / charge values as already converted to dollars
   *  and only flip header labels + amount-in-words (no extra division). */
  currencyMode?: "INR" | "USD";
  /** Columns to hide from the rendered item table (PDF/preview only). */
  hiddenColumns?: PdfColumnKey[];
  docMeta?: {
    title?: string;
    numberLabel?: string;
    numberValue?: string;
    refLabel?: string;
    refValue?: string;
    extraTotalsRows?: { label: string; value: number; bold?: boolean }[];
    hideDefaultGrandTotal?: boolean;
    /** When true (PI), hide the page-1 HEAD OFFICE/Bank/Exclusions block; render it on the T&C page instead. */
    hideFirstPageFooter?: boolean;
  };
}

const fmt = (n: number) =>
  `₹ ${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const fmtFX = (n: number, symbol: string) =>
  `${symbol} ${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const TEMPLATE_COL_WEIGHTS: Record<OrderFormat, Record<PdfColumnKey, number>> = {
  MR: {
    item_no: 5.3,
    model_number: 0,
    description: 41.6,
    make: 12.8,
    qty: 6.4,
    unit: 6.4,
    rate: 12.8,
    amount: 14.7,
  },
  GMS: {
    item_no: 5.8,
    model_number: 14,
    description: 26,
    make: 7,
    qty: 12,
    unit: 7,
    rate: 13.1,
    amount: 15.1,
  },
};

function templateColumnWidth(format: OrderFormat, visible: PdfColumnKey[], key: PdfColumnKey): string {
  const weights = TEMPLATE_COL_WEIGHTS[format];
  const total = visible.reduce((sum, col) => sum + Math.max(0, weights[col] || 0), 0) || 1;
  return `${((Math.max(0, weights[key] || 0) / total) * 100).toFixed(4)}%`;
}

export function OrderPreview(p: Props) {
  const ship = p.sameAsBill ? p.billTo : p.shipTo;
  const isFX = !!p.charges.currency && p.charges.currency !== "INR" && (p.charges.fx_rate || 0) > 0;
  const fxSymbol = p.charges.currency_symbol || CURRENCY_SYMBOLS[p.charges.currency || "INR"] || p.charges.currency || "";
  const fxRate = p.charges.fx_rate || 0;
  // EXW Turkey override: independent PU Dollar Rate beats cost-sheet fx_rate.
  const turkeyRate = (p.charges.turkey_pu_dollar_rate || 0) > 0
    ? (p.charges.turkey_pu_dollar_rate as number)
    : fxRate;
  const advancePct = p.charges.advance_percent ?? 40;
  const inrAmount = isFX ? p.totals.basic_total * fxRate : p.totals.basic_total;
  const advanceAmount = (inrAmount * advancePct) / 100;
  const isMurthal = !!p.charges.ex_murthal_enabled;
  const murthal = isMurthal ? calcExMurthal(inrAmount, p.charges) : null;
  const isTurkey = p.charges.gms_mode === "EXW_TURKEY" && p.format === "GMS";
  const turkey = isTurkey ? calcExTurkey(inrAmount, p.charges) : null;
  // EXW CIF Port — USD-only; Basic (USD) + Local Freight (USD) = EX Work CIF Port (USD).
  const isCifPort = p.format === "GMS" && p.charges.gms_mode === "EXW_CIF_PORT";
  const cifRate = p.charges.cif_pu_dollar_rate || 0;
  // Global GMS USD switch via PU Dollar Rate. Excludes EXW Turkey, which is
  // always USD via its own cost-sheet $ rate (fx_rate) — PU Dollar Rate does
  // not apply to Turkey.
  const gmsUsd = p.format === "GMS" && cifRate > 0 && p.charges.gms_mode !== "EXW_TURKEY";
  // When PU Dollar Rate is 0/blank, fall back to INR display so the totals
  // never collapse to $0.00. When > 0, behave as before (USD = INR / rate).
  const cifUseUSD = isCifPort && cifRate > 0;
  const cifSym = cifUseUSD ? "$" : "₹";
  const cifLocale = cifUseUSD ? "en-US" : "en-IN";
  const cifBasic = cifUseUSD ? p.totals.basic_total / cifRate : p.totals.basic_total;
  const cifSea = (p.charges.cif_sea_freight_mode || "amount") === "percent"
    ? (cifBasic * (p.charges.cif_sea_freight_percent || 0)) / 100
    : (p.charges.cif_sea_freight_usd || 0);
  const cifGrand = cifBasic + cifSea;
  // Back-compat alias kept in case other code paths reference it.
  const cifGrandUSD = cifUseUSD ? cifGrand : 0;
  // Item-level USD display: EXW Turkey is always USD when fx_rate set,
  // OR any other GMS mode with PU Dollar Rate > 0.
  const turkeyAlwaysUSD =
    p.format === "GMS" && p.charges.gms_mode === "EXW_TURKEY" && turkeyRate > 0;
  // Toolbar-forced USD (GMS only). Values in state are already in USD —
  // we only need to relabel and format with $ / en-US.
  const forcedUsd = p.format === "GMS" && p.currencyMode === "USD";
  const displayUSDItems = turkeyAlwaysUSD || gmsUsd || forcedUsd;
  const itemUsdRate = gmsUsd ? cifRate : (turkeyAlwaysUSD ? turkeyRate : fxRate);
  const itemCurLabel = displayUSDItems ? "USD" : "INR";
  // Currency-aware totals formatter for the unified items+totals table.
  const totalFmt = (n: number) =>
    gmsUsd
      ? `$ ${((n || 0) / (cifRate || 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : forcedUsd
        ? `$ ${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
        : (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const itemFmt = (n: number) =>
    (turkeyAlwaysUSD || gmsUsd)
      ? ((n || 0) / (itemUsdRate || 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })
      : forcedUsd
        ? (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })
        : (n || 0).toLocaleString(isFX ? "en-US" : "en-IN", { maximumFractionDigits: 0 });
  const gstAmount = (p.totals.subtotal * (p.charges.gst_percent || 0)) / 100;
  const pfAmount = p.charges.pf_amount > 0
    ? p.charges.pf_amount
    : (p.totals.basic_total * (p.charges.pf_percent || 0)) / 100;
  const insuranceAmount = p.charges.insurance_percent > 0
    ? (p.totals.basic_total * p.charges.insurance_percent) / 100
    : (p.charges.insurance || 0);
  // Discount applies on Basic Amount only and is hidden unless apply_discount.
  const rawDiscount = p.charges.discount_percent > 0
    ? (p.totals.basic_total * p.charges.discount_percent) / 100
    : (p.charges.discount || 0);
  const showDiscount = !!p.charges.apply_discount && rawDiscount > 0;
  const discountAmount = showDiscount ? rawDiscount : 0;
  const discountLabel = (p.charges.discount_label || "").trim()
    || "One Time Very Special Discount";

  return (
    <Card className="overflow-hidden order-preview-card">
      <div className="border-b bg-muted/40 px-4 py-2 flex items-center justify-between gap-2 print:hidden">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Live Preview</div>
        <div className="flex items-center gap-2">
          {p.parsing && (
            <Badge variant="default" className="gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
              Updating…
            </Badge>
          )}
          {p.onFormatChange ? (
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["MR", "GMS"] as OrderFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => p.onFormatChange?.(f)}
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-sm transition-colors ${
                    p.format === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={p.format === f}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : (
            <Badge variant="secondary">{p.format}</Badge>
          )}
          {p.onDownloadPDF && (
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={p.onDownloadPDF} title="Download PDF">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2"
            onClick={() => window.print()}
            title="Print"
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {p.splitMode && (
        <div className="border-b bg-primary/5 px-4 py-1.5 text-[11px] text-muted-foreground print:hidden">
          Split mode: showing only <span className="font-semibold text-foreground">{p.format}</span> items. Toggle above to view the {p.format === "MR" ? "GMS" : "MR"} OA.
        </div>
      )}

      <div
        data-oa-preview-root
        data-oa-format={p.format.toLowerCase()}
        className="bg-background p-5 space-y-4 text-[13px] leading-snug order-preview-body"
      >
        {/* Header */}
        {p.format === "MR" ? (
          <>
            <MRHeader title={p.docMeta?.title} />
            {/* Meta — bordered table matching template */}
            <table className="w-full border-collapse text-[11px] border border-foreground">
              <tbody>
                <tr>
                  <td className="border border-foreground px-2 py-1 w-1/2">
                    <span className="font-bold">{(p.docMeta?.numberLabel || "OA No.") + ": "}</span>
                    {(p.docMeta?.numberValue ?? p.oaNumber) || <Placeholder text="auto on save" />}
                  </td>
                  <td className="border border-foreground px-2 py-1 w-1/2">
                    <span className="font-bold">Dated: </span>
                    {p.orderDate ? new Date(p.orderDate).toLocaleDateString("en-IN") : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-foreground px-2 py-1">
                    <span className="font-bold">{(p.docMeta?.refLabel || "Ref. NO.") + ": "}</span>
                    {(p.docMeta?.refValue ?? (p.reference || p.costSheetNumber)) || <Placeholder />}
                  </td>
                  <td className="border border-foreground px-2 py-1">
                    <span className="font-bold">Prepared By: </span>
                    {p.preparedBy || <Placeholder />}
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <GMSHeader
            title={p.docMeta?.title}
            numberLabel={p.docMeta?.numberLabel}
            numberValue={p.docMeta?.numberValue}
            refLabel={p.docMeta?.refLabel}
            refValue={p.docMeta?.refValue}
            companyName={p.companyName}
            billTo={p.billTo}
            oaNumber={p.oaNumber}
            orderDate={p.orderDate}
            reference={p.reference}
            costSheetNumber={p.costSheetNumber}
            preparedBy={p.preparedBy}
          />
        )}

        {/* Addresses — bordered table */}
        <table className="w-full border-collapse text-[11px] border border-foreground">
          <tbody>
            <tr>
              <td className="border border-foreground px-2 py-1 w-1/2 align-middle bg-muted/40 font-bold uppercase">Bill To</td>
              <td className="border border-foreground px-2 py-1 w-1/2 align-middle bg-muted/40 font-bold uppercase">Ship To</td>
            </tr>
            <tr>
              <td className="border border-foreground px-2 py-1 align-top oa-cell-top">
                <AddressCellContent addr={p.billTo} fallbackName={p.companyName} />
              </td>
              <td className="border border-foreground px-2 py-1 align-top oa-cell-top">
                <AddressCellContent addr={ship} fallbackName={p.companyName} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items + Totals — unified bordered table; column set differs MR vs GMS */}
        {(() => {
          const isGMS = p.format === "GMS";
          let visCols = visibleColumns(p.format, p.hiddenColumns);
          const showCol = (k: PdfColumnKey) => visCols.includes(k);
          // Totals label cell spans every column except the trailing amount column.
          const totalsColSpan = Math.max(1, visCols.length - 1);
          const emptyColSpan = visCols.length;
          const colWidth = (k: PdfColumnKey): string =>
            templateColumnWidth(p.format, visCols, k);
          const afterDiscount = Math.max(0, p.totals.basic_total - discountAmount);
          // When discount applied, % charges resolve against the discounted basic.
          const baseForCharges = showDiscount ? afterDiscount : p.totals.basic_total;
          const pfShown = p.charges.pf_amount > 0
            ? p.charges.pf_amount
            : (baseForCharges * (p.charges.pf_percent || 0)) / 100;
          const insShown = p.charges.insurance_percent > 0
            ? (baseForCharges * p.charges.insurance_percent) / 100
            : (p.charges.insurance || 0);
          const frtShown = p.charges.freight_enabled ? (p.charges.freight || 0) : 0;
          const taxableShown = baseForCharges + pfShown + insShown + frtShown;
          const gstShown = (taxableShown * (p.charges.gst_percent || 0)) / 100;
          const grandShown = showDiscount ? (taxableShown + gstShown) : p.totals.net_payable;
          return (
            <table className={`w-full border-collapse text-[11px] border border-foreground oa-items oa-items-${p.format.toLowerCase()} table-fixed`}>
              <colgroup>
                {visCols.map((k) => (
                  <col key={k} style={{ width: colWidth(k) }} />
                ))}
              </colgroup>
              <thead>
                <tr className={isGMS ? "" : "bg-muted/60"} style={isGMS ? { backgroundColor: "rgb(220,220,220)" } : undefined}>
                  {showCol("item_no") && (
                    <th className="border border-foreground px-1.5 py-1 text-center oa-cell-num"><div className="oa-cell-inner">{isGMS ? "ITEM NO" : "S. No."}</div></th>
                  )}
                  {showCol("model_number") && (
                    <th className="border border-foreground px-1.5 py-1 text-center"><div className="oa-cell-inner">MODEL NUMBER</div></th>
                  )}
                  {showCol("description") && (
                    <th className="border border-foreground px-1.5 py-1 text-center"><div className="oa-cell-inner">{isGMS ? "DESCRIPTION" : "Item Description"}</div></th>
                  )}
                  {showCol("make") && (
                    <th className="border border-foreground px-1.5 py-1 text-center"><div className="oa-cell-inner">{isGMS ? "MAKE" : "Make"}</div></th>
                  )}
                  {showCol("qty") && (
                    <th className="border border-foreground px-1.5 py-1 text-center oa-cell-num"><div className="oa-cell-inner">{isGMS ? "QTY" : "Qty."}</div></th>
                  )}
                  {showCol("unit") && (
                    <th className="border border-foreground px-1.5 py-1 text-center oa-cell-num"><div className="oa-cell-inner">{isGMS ? "UNIT" : "Unit"}</div></th>
                  )}
                  {showCol("rate") && (
                    <th className="border border-foreground px-1.5 py-1 text-center oa-cell-num">
                      <div className="oa-cell-inner">{isGMS ? `UNIT PRICE (${itemCurLabel})` : `Rate${isFX ? ` (${fxSymbol})` : ""}`}</div>
                    </th>
                  )}
                  {showCol("amount") && (
                    <th className="border border-foreground px-1.5 py-1 text-center oa-cell-num">
                      <div className="oa-cell-inner">{isGMS ? `AMOUNT (${itemCurLabel})` : `Amount${isFX ? ` (${fxSymbol})` : ""}`}</div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {p.items.length === 0 || p.items.every((i) => !i.description && !i.amount) ? (
                  <tr>
                    <td colSpan={emptyColSpan} className="border border-foreground px-2 py-3 text-center italic text-muted-foreground"><div className="oa-cell-inner">No line items yet</div></td>
                  </tr>
                ) : (
                  p.items.map((it, idx) => (
                    <tr key={it.id || idx}>
                      {showCol("item_no") && (
                        <td className="border border-foreground px-1.5 py-1 text-center align-middle tabular-nums oa-cell-nowrap"><div className="oa-cell-inner">{idx + 1}</div></td>
                      )}
                      {showCol("model_number") && (
                        <td className="border border-foreground px-1.5 py-1 text-center align-middle oa-cell-wrap"><div className="oa-cell-inner">{((it as unknown as { model_number?: string }).model_number || "").trim() || "\u00a0"}</div></td>
                      )}
                      {showCol("description") && (
                        <td className="border border-foreground px-1.5 py-1 align-middle text-left oa-cell-wrap">
                          <div className="oa-cell-inner">{it.description || <Placeholder text="(blank)" />}</div>
                        </td>
                      )}
                      {showCol("make") && (
                        <td className="border border-foreground px-1.5 py-1 text-center align-middle oa-cell-wrap"><div className="oa-cell-inner">{displayMake(it)}</div></td>
                      )}
                      {showCol("qty") && (
                        <td className="border border-foreground px-1.5 py-1 text-center align-middle tabular-nums oa-cell-nowrap"><div className="oa-cell-inner">{it.quantity || 0}</div></td>
                      )}
                      {showCol("unit") && (
                        <td className="border border-foreground px-1.5 py-1 text-center align-middle oa-cell-nowrap"><div className="oa-cell-inner">{it.unit || "Nos"}</div></td>
                      )}
                      {showCol("rate") && (
                        <td className="border border-foreground px-1.5 py-1 text-right align-middle tabular-nums oa-cell-nowrap">
                          <div className="oa-cell-inner">{itemFmt(it.unit_rate || 0)}</div>
                        </td>
                      )}
                      {showCol("amount") && (
                        <td className="border border-foreground px-1.5 py-1 text-right align-middle tabular-nums oa-cell-nowrap">
                          <div className="oa-cell-inner">{itemFmt(it.amount || 0)}</div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
                {/* Inline totals rows (only for non-FX, non-Murthal — matches reference format) */}
                {!isFX && !isMurthal && !isTurkey && !isCifPort && (
                  isGMS ? (
                    <>
                      <TotalsRow colSpan={totalsColSpan} label={gmsUsd ? "Basic Total" : "Ex-works Murthal Price"} value={p.totals.basic_total} format={totalFmt} />
                      {p.docMeta?.extraTotalsRows?.map((r, i) => (
                        <TotalsRow key={`xg${i}`} colSpan={totalsColSpan} label={r.label} value={r.value} highlight={r.bold} format={totalFmt} />
                      ))}
                      {!p.docMeta?.hideDefaultGrandTotal && (
                        <TotalsRow colSpan={totalsColSpan} label="Grand Total" value={p.totals.basic_total} highlight format={totalFmt} />
                      )}
                    </>
                  ) : (
                    <>
                      <TotalsRow colSpan={totalsColSpan} label={showDiscount ? "Sub Total" : "Basic Total"} value={p.totals.basic_total} />
                      {showDiscount && (
                        <TotalsRow colSpan={totalsColSpan} label={discountLabel} value={discountAmount} />
                      )}
                      {showDiscount && (
                        <TotalsRow colSpan={totalsColSpan} label="After Discount" value={afterDiscount} />
                      )}
                      {(p.charges.pf_amount > 0 || p.charges.pf_percent > 0) && pfShown > 0 && (
                        <TotalsRow colSpan={totalsColSpan} label={`P&F${p.charges.pf_percent ? ` @ ${p.charges.pf_percent}%` : ""}`} value={pfShown} />
                      )}
                      {insShown > 0 && (
                        <TotalsRow colSpan={totalsColSpan} label={`Insurance${p.charges.insurance_percent ? ` @ ${p.charges.insurance_percent}%` : ""}`} value={insShown} />
                      )}
                      {frtShown > 0 && (
                        <TotalsRow colSpan={totalsColSpan} label="Freight" value={frtShown} />
                      )}
                      {!showDiscount && (
                        <TotalsRow colSpan={totalsColSpan} label="Subtotal" value={p.totals.subtotal} />
                      )}
                      <TotalsRow colSpan={totalsColSpan} label={`GST @ ${p.charges.gst_percent || 0}%`} value={gstShown} />
                      {p.docMeta?.extraTotalsRows?.map((r, i) => (
                        <TotalsRow key={`xm${i}`} colSpan={totalsColSpan} label={r.label} value={r.value} highlight={r.bold} />
                      ))}
                      {!p.docMeta?.hideDefaultGrandTotal && (
                        <TotalsRow colSpan={totalsColSpan} label="Grand Total" value={grandShown} highlight />
                      )}
                      {p.format === "MR" && p.charges.mr_advance_enabled && (() => {
                        const mode = p.charges.mr_advance_mode || "percent";
                        const adv = mode === "percent"
                          ? ((p.totals.basic_total - discountAmount) * (p.charges.mr_advance_percent || 0)) / 100
                          : (p.charges.mr_advance_amount || 0);
                        if (adv <= 0) return null;
                        const lbl = mode === "percent"
                          ? `Advance Adjustment @ ${p.charges.mr_advance_percent || 0}%`
                          : "Advance Adjustment";
                        return (
                          <>
                            <TotalsRow colSpan={totalsColSpan} label={lbl} value={adv} />
                            <TotalsRow colSpan={totalsColSpan} label="Net Payable" value={Math.max(0, grandShown - adv)} highlight />
                          </>
                        );
                      })()}
                    </>
                  )
                )}
              </tbody>
            </table>
          );
        })()}

        {/* Amount in words — sits between table and post sections (matches template) */}
        {!isFX && !isMurthal && !isTurkey && !isCifPort && p.amountInWords && p.totals.net_payable > 0 && (
          <div className="text-[11px] font-semibold uppercase tracking-wide">
            AMOUNT (IN WORDS): {forcedUsd
              ? amountInWordsUSD(p.totals.net_payable)
              : gmsUsd
                ? amountInWordsUSD(p.totals.net_payable / (cifRate || 1))
                : turkeyAlwaysUSD
                  ? amountInWordsUSD(p.totals.net_payable / (turkeyRate || 1))
                  : p.amountInWords.replace(/^INR\s*/i, "RS. ")}
          </div>
        )}
        {/* EXW Murthal AMOUNT (IN WORDS) is rendered AFTER Net Payable —
            see the isMurthal branch below. */}

        {/* Specialised totals layouts (Ex-works Murthal & Ex-works FX) */}
        {isCifPort ? (
          <>
          <div className="border rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">Basic Total</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-40">
                {cifSym} {cifBasic.toLocaleString(cifLocale, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">
                Sea Freight{(p.charges.cif_sea_freight_mode || "amount") === "percent"
                  ? ` @ ${p.charges.cif_sea_freight_percent || 0}%`
                  : ""}
              </div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-40">
                {cifSym} {cifSea.toLocaleString(cifLocale, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center bg-muted/40">
              <div className="px-2 py-1.5 text-right font-bold">EX Work CIF Port</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-40">
                {cifSym} {cifGrand.toLocaleString(cifLocale, { maximumFractionDigits: 0 })}
              </div>
            </div>
            {cifRate > 0 && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground italic border-t">
                USD values converted from INR @ PU Dollar Rate ₹{cifRate}.
              </div>
            )}
          </div>
          {cifGrand > 0 && (
            <div className="text-[11px] font-semibold uppercase tracking-wide">
              AMOUNT (IN WORDS): {cifUseUSD ? amountInWordsUSD(cifGrand) : amountInWords(cifGrand).replace(/^INR\s*/i, "RS. ")}
            </div>
          )}
          </>
        ) : isTurkey && turkey ? (
          <>
            <ExTurkeyBlock t={turkey} c={p.charges} fxSymbol={fxSymbol} fxRate={turkeyRate} isFX={isFX} basicFX={p.totals.basic_total} forceUsdRate={gmsUsd ? cifRate : 0} />
            {(() => {
              const showNet =
                (p.charges.turkey_advance_enabled && turkey.advance_amount > 0) ||
                (p.charges.turkey_discount_enabled && turkey.discount > 0);
              const inrVal = showNet ? turkey.net_payable : turkey.grand_total;
              if (!(inrVal > 0)) return null;
              const useUSD = (turkeyRate || 0) > 0;
              return (
                <div className="text-[11px] font-semibold uppercase tracking-wide">
                  AMOUNT (IN WORDS): {useUSD
                    ? amountInWordsUSD(inrVal / (turkeyRate || 1))
                    : amountInWords(inrVal).replace(/^INR\s*/i, "RS. ")}
                </div>
              );
            })()}
          </>
        ) : isMurthal && murthal ? (
          <>
            <ExMurthalBlock
              m={murthal}
              c={p.charges}
              fxSymbol={fxSymbol}
              fxRate={fxRate}
              isFX={isFX}
              basicFX={p.totals.basic_total}
              forceUsdRate={gmsUsd ? cifRate : 0}
              forcedUsd={forcedUsd && !gmsUsd}
            />
            {murthal.net_payable > 0 && (() => {
              const inrModeM = (murthal.landed_inr_rate || 0) > 0;
              let words = "";
              if (inrModeM) {
                // Net Payable already in ₹ INR.
                words = amountInWords(murthal.net_payable).replace(/^INR\s*/i, "RS. ");
              } else if (gmsUsd && cifRate > 0) {
                words = amountInWordsUSD(murthal.net_payable / cifRate);
              } else if (forcedUsd) {
                words = amountInWordsUSD(murthal.net_payable);
              } else {
                words = amountInWords(murthal.net_payable).replace(/^INR\s*/i, "RS. ");
              }
              return (
                <div className="text-[11px] font-semibold uppercase tracking-wide">
                  AMOUNT (IN WORDS): {words}
                </div>
              );
            })()}
          </>
        ) : isFX ? (
          <div className="border rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">Price Ex-works {p.charges.currency}</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">{fxSymbol}</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {(p.totals.basic_total || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">Amount in INR @{fxRate}</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">₹</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {inrAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center">
              <div className="px-2 py-1.5 text-right font-bold">Advance Required @ {advancePct}%</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">₹</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {advanceAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        ) : null}

        {p.notes && (
          <div className="text-xs">
            <div className="font-semibold mb-0.5">Notes</div>
            <div className="whitespace-pre-wrap text-muted-foreground">{p.notes}</div>
          </div>
        )}

        {p.format === "MR" && <MRPostItems terms={p.terms} bank={p.bank} preparedBy={p.preparedBy} />}

        {p.format === "GMS" && !p.docMeta?.hideFirstPageFooter && isFX && (
          <GMSFooter fxRate={fxRate} currency={p.charges.currency || "USD"} bank={p.bank} />
        )}
        {p.format === "GMS" && !p.docMeta?.hideFirstPageFooter && !isFX && (
          <GMSHeadOfficeBank bank={p.bank} />
        )}

        {p.format === "GMS" && p.gmsTerms && (
          <GMSTermsBlock
            t={p.gmsTerms}
            includeExclusions={!!p.docMeta?.hideFirstPageFooter}
            fxRate={fxRate}
            currency={p.charges.currency || "INR"}
            isFX={isFX}
            bank={p.bank}
          />
        )}

        {p.format !== "MR" && p.preparedBy && (
          <div className="text-xs text-right pt-2 border-t">
            <div className="text-muted-foreground">Prepared by</div>
            <div className="font-medium">{p.preparedBy}</div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ExMurthalBlock({
  m, c, fxSymbol, fxRate, isFX, basicFX, forceUsdRate = 0, forcedUsd = false,
}: {
  m: ReturnType<typeof calcExMurthal>;
  c: Charges;
  fxSymbol: string;
  fxRate: number;
  isFX: boolean;
  basicFX: number;
  forceUsdRate?: number;
  forcedUsd?: boolean;
}) {
  const displayUSD = forcedUsd || forceUsdRate > 0 || (c.display_currency === "USD" && (fxRate || 0) > 0);
  const usdRate = forceUsdRate > 0 ? forceUsdRate : (fxRate || 1);
  const usdSym = forceUsdRate > 0 ? "$" : (fxSymbol || "$");
  const inr = (n: number) =>
    `₹ ${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const usd = (n: number) =>
    `${usdSym} ${((n || 0) / (usdRate || 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  // When toolbar-forced USD: state values are already in USD — show "$ n" without re-dividing.
  const usdDirect = (n: number) =>
    `$ ${(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const fmtAmt = (n: number) =>
    forcedUsd ? usdDirect(n) : displayUSD ? usd(n) : inr(n);
  // EXW Murthal — when "Amount in INR" rate is set, values up to Landed
  // stay in the active "above-landed" currency; values from "Amount in INR"
  // row downward are always rendered in ₹ INR.
  const inrRate = c.murthal_landed_inr_rate || 0;
  const inrMode = inrRate > 0;
  const fmtInr = (n: number) => inr(n);
  const Row = ({ k, v, bold, sub }: { k: string; v: number; bold?: boolean; sub?: boolean }) => (
    <div className={`grid grid-cols-[1fr_auto] items-center border-b last:border-b-0 ${bold ? "bg-muted/40" : ""}`}>
      <div className={`px-2 py-1.5 ${sub ? "pl-6" : ""} ${bold ? "font-bold" : ""}`}>{k}</div>
      <div className={`px-2 py-1.5 border-l text-right tabular-nums w-40 ${bold ? "font-bold" : ""}`}>{fmtAmt(v)}</div>
    </div>
  );
  const InrRow = ({ k, v, bold }: { k: string; v: number; bold?: boolean }) => (
    <div className={`grid grid-cols-[1fr_auto] items-center border-b last:border-b-0 ${bold ? "bg-muted/40" : ""}`}>
      <div className={`px-2 py-1.5 ${bold ? "font-bold" : ""}`}>{k}</div>
      <div className={`px-2 py-1.5 border-l text-right tabular-nums w-40 ${bold ? "font-bold" : ""}`}>{fmtInr(v)}</div>
    </div>
  );
  return (
    <div className="border rounded overflow-hidden text-xs">
      {isFX && (
        <div className="grid grid-cols-[1fr_auto] items-center border-b bg-muted/30">
          <div className="px-2 py-1.5 italic">Ex-works {c.currency} {fxSymbol}{basicFX.toLocaleString("en-US", { maximumFractionDigits: 0 })} @ ₹{fxRate}</div>
          <div className="px-2 py-1.5 border-l text-right tabular-nums w-40">{inr(m.base_amount)}</div>
        </div>
      )}
      <Row k="Base Amount" v={m.base_amount} />
      {c.sea_freight_enabled && <Row k="Sea Freight" v={m.sea_freight} />}
      {c.custom_enabled && <Row k="Custom Duty" v={m.custom} />}
      {c.clearing_enabled && <Row k="Clearing Charge / CHA & Port" v={m.clearing} />}
      <Row k="Landed Price" v={m.total_amount} bold />
      {c.murthal_landed_discount_enabled && m.landed_discount_amount > 0 && (
        <>
          <Row k="Discount on Landed" v={-m.landed_discount_amount} />
          <Row k="Net Landed Price" v={m.net_landed} bold />
        </>
      )}
      {inrMode && <InrRow k={`Amount in INR @ ${inrRate}`} v={m.amount_in_inr} bold />}
      {(() => {
        const R = inrMode ? InrRow : Row;
        return (
          <>
            {c.sea_insurance_enabled && <R k="Insurance" v={m.sea_insurance} />}
            {(c.murthal_pf_enabled || c.pf_amount > 0 || c.pf_percent > 0) && m.pf > 0 && (
              <R k="P&F" v={m.pf} />
            )}
            {(c.murthal_freight_enabled || c.freight_enabled) && m.freight > 0 && (
              <R k="Freight" v={m.freight} />
            )}
            {c.landed_gst_enabled && <R k="GST" v={m.gst} />}
            <R k="Grand Total" v={m.grand_total} bold />
            {c.landed_discount_enabled && m.discount > 0 && (
              <R k="One-time Discount" v={-m.discount} />
            )}
            {c.murthal_advance_enabled && m.advance_amount > 0 && (
              <R k="Advance Adjustment" v={-m.advance_amount} />
            )}
            <R k="Net Payable" v={m.net_payable} bold />
          </>
        );
      })()}
    </div>
  );
}

function ExTurkeyBlock({
  t, c, fxSymbol, fxRate, isFX, basicFX, forceUsdRate = 0,
}: {
  t: ReturnType<typeof calcExTurkey>;
  c: Charges;
  fxSymbol: string;
  fxRate: number;
  isFX: boolean;
  basicFX: number;
  forceUsdRate?: number;
}) {
  // Phase 1: when user picks display_currency="USD" on a GMS Turkey OA/PI
  // and a cost-sheet $ rate is set, render the totals block in USD by
  // dividing each INR value by the rate. The math itself stays INR-based.
  // EXW Turkey block: always USD when fx_rate set; forceUsdRate only used for non-Turkey.
  const displayUSD = (fxRate || 0) > 0 || forceUsdRate > 0;
  const usdRate = (fxRate || 0) > 0 ? fxRate : (forceUsdRate || 1);
  const usdSym = "$";
  const inr = (n: number) =>
    `₹ ${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const usd = (n: number) =>
    `${usdSym} ${((n || 0) / (usdRate || 1)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const fmtAmt = (n: number) => (displayUSD ? usd(n) : inr(n));
  const Row = ({ k, v, bold }: { k: string; v: number; bold?: boolean }) => (
    <div className={`grid grid-cols-[1fr_auto] items-center border-b last:border-b-0 ${bold ? "bg-muted/40" : ""}`}>
      <div className={`px-2 py-1.5 ${bold ? "font-bold" : ""}`}>{k}</div>
      <div className={`px-2 py-1.5 border-l text-right tabular-nums w-40 ${bold ? "font-bold" : ""}`}>{fmtAmt(v)}</div>
    </div>
  );
  const insLbl = c.turkey_insurance_enabled
    ? ((c.turkey_insurance_mode || "amount") === "percent" && c.turkey_insurance_percent
        ? `Insurance @ ${c.turkey_insurance_percent}%`
        : "Insurance")
    : "Insurance";
  const pfLbl = c.turkey_pf_enabled
    ? ((c.turkey_pf_mode || "percent") === "percent" && c.turkey_pf_percent
        ? `P&F @ ${c.turkey_pf_percent}%`
        : "P&F")
    : "P&F";
  const customLbl = c.turkey_custom_percent
    ? `Custom Duty @ ${c.turkey_custom_percent}%`
    : "Custom Duty";
  const gstLbl = c.turkey_gst_percent
    ? `GST @ ${c.turkey_gst_percent}%`
    : "GST";
  const advLbl = (c.turkey_advance_mode || "percent") === "percent" && c.turkey_advance_percent
    ? `Advance Adjustment @ ${c.turkey_advance_percent}%`
    : "Advance Adjustment";
  const discLbl = (c.turkey_landed_discount_mode || "percent") === "percent" && c.turkey_landed_discount_percent
    ? `Discount @ ${c.turkey_landed_discount_percent}% on Landed`
    : "Discount on Landed";
  return (
    <div className="border rounded overflow-hidden text-xs">
      {displayUSD && (
        <div className="px-2 py-1.5 border-b bg-muted/30 text-[11px] italic">
          Showing totals in USD ({usdSym}) — converted from INR @ ₹{usdRate} ({forceUsdRate > 0 ? "PU Dollar Rate" : "cost-sheet rate"}). Underlying calculation is in INR.
        </div>
      )}
      {isFX && (
        <div className="grid grid-cols-[1fr_auto] items-center border-b bg-muted/30">
          <div className="px-2 py-1.5 italic">EXW Turkey {c.currency} {fxSymbol}{basicFX.toLocaleString("en-US", { maximumFractionDigits: 0 })} @ ₹{fxRate}</div>
          <div className="px-2 py-1.5 border-l text-right tabular-nums w-40">{fmtAmt(t.base_amount)}</div>
        </div>
      )}
      <Row k="Base Amount (EXW Turkey)" v={t.base_amount} />
      {c.turkey_sea_freight_enabled && <Row k="Sea Freight" v={t.sea_freight} />}
      {c.turkey_custom_enabled && <Row k={customLbl} v={t.custom} />}
      {c.turkey_landed_discount_enabled && t.landed_discount > 0 && (
        <>
          <Row k={discLbl} v={-t.landed_discount} />
          <Row k="Net Landed Price" v={t.net_landed} bold />
        </>
      )}
      {c.turkey_insurance_enabled && <Row k={insLbl} v={t.insurance} />}
      {c.turkey_pf_enabled && <Row k={pfLbl} v={t.pf} />}
      {c.turkey_freight_enabled && t.freight > 0 && <Row k="Freight" v={t.freight} />}
      {c.turkey_gst_enabled && <Row k={gstLbl} v={t.gst} />}
      <Row k="Grand Total" v={t.grand_total} bold />
      {c.turkey_discount_enabled && t.discount > 0 && (
        <Row k="One-time Discount" v={-t.discount} />
      )}
      {c.turkey_advance_enabled && t.advance_amount > 0 && (
        <Row k={advLbl} v={t.advance_amount} />
      )}
      {((c.turkey_advance_enabled && t.advance_amount > 0) ||
        (c.turkey_discount_enabled && t.discount > 0)) && (
        <Row k="Net Payable" v={t.net_payable} bold />
      )}
    </div>
  );
}

function GMSHeadOfficeBank({ bank: bankProp }: { bank?: BankDetails } = {}) {
  const bank = bankProp ?? DEFAULT_GMS_BANK;
  return (
    <div className="grid grid-cols-2 gap-4 pt-2 text-[11px]">
      <div>
        <div className="font-bold">HEAD OFFICE</div>
        {GMS_HEAD_OFFICE_LINES.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div>
        <div className="font-bold">Our Bank Details :</div>
        <div className="font-bold">GRAIN MILLING SOLUTIONS PVT. LTD.</div>
        <div><span className="font-bold">Bank :</span> {bank.bank_name}</div>
        <div><span className="font-semibold">Branch :</span> {bank.branch}</div>
        <div><span className="font-semibold">A/C No :</span> {bank.account_no}</div>
        <div><span className="font-semibold">IFSC CODE :</span> {bank.ifsc}</div>
      </div>
    </div>
  );
}

function GMSFooter({ fxRate, currency, bank }: { fxRate: number; currency: string; bank?: BankDetails }) {
  return (
    <div className="border-t-2 border-foreground mt-3 pt-2 text-[11px] space-y-2">
      <div className="space-y-0.5 font-semibold">
        {DEFAULT_GMS_EXCLUSIONS.map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div>
          {currency} conversion rate - @Rs{fxRate}. Any variation in exchange rate will be borne by client.
        </div>
      </div>
      <GMSHeadOfficeBank bank={bank} />
    </div>
  );
}

function GMSTermsBlock({
  t, includeExclusions, fxRate, currency, isFX, bank,
}: {
  t: GMSTerms;
  includeExclusions?: boolean;
  fxRate?: number;
  currency?: string;
  isFX?: boolean;
  bank?: BankDetails;
}) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-0.5">
      <div className="font-bold">{label}</div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  );
  return (
    <div className="border-t-2 border-foreground mt-3 pt-3 text-[11px] space-y-3 page-break-before pdf-keep-group">
      <div className="text-center font-bold text-base tracking-wide">TERMS &amp; CONDITIONS</div>
      <div className="font-bold underline uppercase">Commercial Condition :</div>
      <Row label="Taxation :" value={t.taxation} />
      <Row label="Freight :" value={t.freight} />
      <Row label="INSURANCE :" value={t.insurance} />
      <Row label="Delivery Time :" value={t.delivery_time} />
      <Row label="Payment Terms :" value={t.payment_terms} />
      <Row label="General Conditions :" value={t.general_conditions} />
      {includeExclusions && (
        <div className="space-y-0.5 font-semibold pt-2 border-t border-foreground/40">
          {DEFAULT_GMS_EXCLUSIONS.map((line) => (
            <div key={line}>{line}</div>
          ))}
          {isFX && fxRate ? (
            <div>
              {currency} conversion rate - @Rs{fxRate}. Any variation in exchange rate will be borne by client.
            </div>
          ) : null}
        </div>
      )}
      <GMSHeadOfficeBank bank={bank} />
    </div>
  );
}

function MRPostItems({ terms, bank, preparedBy }: { terms?: string; bank?: BankDetails; preparedBy?: string }) {
  return (
    <div className="space-y-0 text-[11px] border-t-2 border-foreground mt-2 pdf-keep-group">
      {/* Amount in words band */}
      {/* Terms & Conditions */}
      <div className="border border-foreground border-t-0 px-2 py-1.5 pdf-keep">
        <div className="font-bold uppercase italic mb-0.5">Terms &amp; Conditions</div>
        <div className="whitespace-pre-wrap break-words leading-relaxed">{terms || ""}</div>
      </div>

      {/* Bank + Signature row */}
      <div className="grid grid-cols-2 border border-foreground border-t-0 pdf-keep">
        <div className="px-2 py-1.5 border-r border-foreground break-words">
          <div className="font-bold italic uppercase">Our Bank Details :-</div>
          {bank && (
            <div className="mt-0.5 space-y-0.5 font-semibold">
              <div>{bank.bank_name}</div>
              <div>BRANCH: {bank.branch}</div>
              <div>C/A A/C NO. {bank.account_no}</div>
              <div>IFSC CODE: {bank.ifsc}</div>
            </div>
          )}
        </div>
        <div className="px-2 py-1.5 flex flex-col items-end justify-between min-h-[110px] relative">
          <div className="font-semibold italic">Yours faithfully</div>
          <img
            src={mrStamp}
            alt="M.R. Engineers stamp"
            className="oa-pdf-stamp absolute right-3 top-4 h-16 w-16 object-contain opacity-90 pointer-events-none select-none"
            style={{ clipPath: "inset(22% 0 0 0)" }}
            crossOrigin="anonymous"
            loading="eager"
          />
          <div className="text-right">
            <div className="font-bold tracking-wide">M.R. ENGINEERS</div>
            {preparedBy && <div className="text-[10px] text-muted-foreground">{preparedBy}</div>}
          </div>
        </div>
      </div>

      {/* Small "M.R. ENGINEERS" label row above the yellow strip (matches PDF) */}
      <div className="border border-foreground border-t-0 px-2 py-1 text-right text-[10px] font-bold pdf-keep">
        M.R. ENGINEERS
      </div>

      {/* Footer address band */}
      <div className="bg-primary/90 text-primary-foreground text-center font-semibold uppercase tracking-wide px-2 py-1.5 text-[10px] pdf-keep">
        {MR_FOOTER_ADDRESS}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}

function AddressBlock({ title, addr, fallbackName }: { title: string; addr: Address; fallbackName: string }) {
  const empty = !addr?.name && !addr?.address && !fallbackName;
  return (
    <div className="border rounded p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide mb-1">{title}</div>
      {empty ? <Placeholder text="not set" /> : (
        <div className="space-y-0.5">
          <div className="font-semibold">{addr?.name || fallbackName}</div>
          {addr?.address && <div className="text-xs whitespace-pre-wrap text-muted-foreground">{addr.address}</div>}
          {(addr?.gstin || addr?.state) && (
            <div className="text-[11px] text-muted-foreground">
              {addr.gstin && <span>GSTIN: {addr.gstin}</span>}
              {addr.gstin && addr.state && <span> · </span>}
              {addr.state && <span>{addr.state}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Line({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{k}</span>
      <span className="tabular-nums">{fmt(v)}</span>
    </div>
  );
}

function TotalsRow({ label, value, highlight, colSpan = 6, format }: { label: string; value: number; highlight?: boolean; colSpan?: number; format?: (n: number) => string }) {
  return (
    <tr className={highlight ? "bg-yellow-200/70" : ""}>
      <td colSpan={colSpan} className={`border border-foreground px-1.5 py-1 text-right align-middle oa-cell-wrap ${highlight ? "font-bold" : "font-semibold"}`}>
        <div className="oa-cell-inner">{label}</div>
      </td>
      <td className={`border border-foreground px-1.5 py-1 text-right align-middle tabular-nums oa-cell-nowrap ${highlight ? "font-bold" : ""}`}>
        <div className="oa-cell-inner">{format ? format(value) : value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
      </td>
    </tr>
  );
}

function Placeholder({ text = "—" }: { text?: string }) {
  return <span className="text-muted-foreground italic font-normal">{text}</span>;
}

function AddressCellContent({ addr, fallbackName }: { addr: Address; fallbackName: string }) {
  const empty = !addr?.name && !addr?.address && !fallbackName;
  if (empty) return <Placeholder text="not set" />;
  return (
    <div className="space-y-0.5">
      <div className="font-semibold">{addr?.name || fallbackName}</div>
      {addr?.address && <div className="whitespace-pre-wrap">{addr.address}</div>}
      {addr?.gstin && <div>GSTIN: {addr.gstin}</div>}
      {addr?.state && <div>State: {addr.state}</div>}
      {addr?.contact_person && <div>Contact: {addr.contact_person}</div>}
      {addr?.contact_number && <div>Phone: {addr.contact_number}</div>}
      {addr?.email && <div>Email: {addr.email}</div>}
    </div>
  );
}

function MRHeader({ title }: { title?: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 pb-2">
        <img
          src={mrLogo}
          alt="MR Engineers logo"
          width={120}
          height={48}
          loading="lazy"
          className="h-12 w-auto object-contain shrink-0"
        />
        <div className="text-right">
          <div className="text-xl font-extrabold tracking-tight leading-none">M.R. Engineers</div>
          <div className="text-[10px] font-bold mt-1 tracking-wide">
            *&nbsp;&nbsp;ENGINEERS&nbsp;&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;CONTRACTORS&nbsp;&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;SUPPLIERS
          </div>
          <div className="text-[10px] mt-0.5">Shed No. 33, HSIIDC, Murthal, Sonepat.</div>
          <div className="text-[10px] font-bold">GSTIN-06AARPM1849G1ZF</div>
        </div>
      </div>
      <div className="border-t-[1.5px] border-primary" />
      <div className="text-center mt-2">
        <div className="text-sm font-bold tracking-[0.2em] text-foreground">{title || "ORDER ACCEPTANCE"}</div>
      </div>
    </div>
  );
}

function GMSHeader({
  companyName, billTo, oaNumber, orderDate, reference, costSheetNumber, preparedBy,
  title, numberLabel, numberValue, refLabel, refValue,
}: {
  companyName: string; billTo: Address; oaNumber: string; orderDate: string;
  reference: string; costSheetNumber: string; preparedBy: string;
  title?: string; numberLabel?: string; numberValue?: string; refLabel?: string; refValue?: string;
}) {
  const customerName = billTo?.name || companyName;
  const dateStr = orderDate ? new Date(orderDate).toLocaleDateString("en-IN") : "—";
  return (
    <div className="space-y-0">
      {/* Dual-logo banner */}
      <div className="pdf-keep oa-gms-logo-row flex items-end justify-between gap-4 pb-2">
        <div className="flex flex-col items-start">
          <img
            src={gmsLogo}
            alt="GMS Grain Milling Solutions logo"
            width={160}
            height={64}
            loading="lazy"
            className="h-14 w-auto object-contain"
          />
          <div className="text-[10px] font-bold mt-1 tracking-tight">
            GRAIN MILLING SOLUTIONS PRIVATE LIMITED
          </div>
        </div>
        <div className="flex flex-col items-end">
          <img
            src={ugurLogo}
            alt="Uğur Machine Turkey logo"
            width={120}
            height={48}
            loading="lazy"
            className="h-12 w-auto object-contain"
          />
          <div className="text-[11px] font-bold mt-1 leading-tight">UGUR MACHINE, TURKEY</div>
          <div className="text-[9px] italic text-muted-foreground leading-tight">
            Quality Standard is an Assurance of UGUR at all parts
          </div>
        </div>
      </div>
      {/* Grey ORDER ACCEPTANCE bar */}
      <div className="pdf-keep oa-gms-title-bar mt-3 py-1 text-center" style={{ backgroundColor: "rgb(200,200,200)" }}>
        <div className="text-sm font-bold tracking-[0.2em] text-black">{title || "ORDER ACCEPTANCE"}</div>
      </div>
      {/* Customer / OA meta — borderless two-column block */}
      <div className="pdf-keep oa-gms-meta grid grid-cols-2 gap-4 mt-3 text-[11px]">
        <div className="space-y-0.5">
          <div className="font-bold">{customerName ? `M/s ${customerName}` : <Placeholder text="customer" />}</div>
          {billTo?.address && <div className="whitespace-pre-wrap">{billTo.address}</div>}
          {billTo?.contact_person && <div><span className="font-semibold">Contact Person Name :</span> {billTo.contact_person}</div>}
          {billTo?.contact_number && <div><span className="font-semibold">Mobile No.:</span> {billTo.contact_number}</div>}
          {billTo?.email && <div><span className="font-semibold">Email:-</span> {billTo.email}</div>}
          {billTo?.gstin && (
            <div className="font-semibold">
              GSTIN No.-{billTo.gstin}
              {billTo?.state_code && `, State Code - ${billTo.state_code}`}
            </div>
          )}
        </div>
        <div className="text-right space-y-0.5">
          <div><span className="font-semibold">Date :</span> {dateStr}</div>
          <div><span className="font-semibold">{(numberLabel || "OA No.") + ":"}</span> {(numberValue ?? oaNumber) || <Placeholder text="auto on save" />}</div>
          <div><span className="font-semibold">{(refLabel || "Ref.") + " :"}</span> {(refValue ?? (reference || costSheetNumber)) || <Placeholder />}</div>
          <div><span className="font-semibold">Contact :-</span> Mr. Bhavesh Makin</div>
          <div><span className="font-semibold">Mob :-</span> +91-9910066823</div>
          {preparedBy && <div><span className="font-semibold">Prepared By:-</span> {preparedBy}</div>}
        </div>
      </div>
    </div>
  );
}
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";
import { calcExMurthal, calcExTurkey } from "@/lib/orders/calc";
import mrLogo from "@/assets/mr-logo.png";
import gmsLogo from "@/assets/gms-logo.png";
import ugurLogo from "@/assets/ugur-logo.png";
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
  `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtFX = (n: number, symbol: string) =>
  `${symbol} ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderPreview(p: Props) {
  const ship = p.sameAsBill ? p.billTo : p.shipTo;
  const isFX = !!p.charges.currency && p.charges.currency !== "INR" && (p.charges.fx_rate || 0) > 0;
  const fxSymbol = p.charges.currency_symbol || CURRENCY_SYMBOLS[p.charges.currency || "INR"] || p.charges.currency || "";
  const fxRate = p.charges.fx_rate || 0;
  const advancePct = p.charges.advance_percent ?? 40;
  const inrAmount = isFX ? p.totals.basic_total * fxRate : p.totals.basic_total;
  const advanceAmount = (inrAmount * advancePct) / 100;
  const isMurthal = !!p.charges.ex_murthal_enabled;
  const murthal = isMurthal ? calcExMurthal(inrAmount, p.charges) : null;
  const isTurkey = p.charges.gms_mode === "EXW_TURKEY" && p.format === "GMS";
  const turkey = isTurkey ? calcExTurkey(inrAmount, p.charges) : null;
  // Phase 1: Item-level USD display when GMS (Turkey or Murthal) + display_currency=USD + fx_rate set.
  const displayUSDItems =
    p.format === "GMS" && p.charges.display_currency === "USD" && fxRate > 0;
  const itemCurLabel = displayUSDItems ? (p.charges.currency || "USD") : "INR";
  const itemFmt = (n: number) =>
    displayUSDItems
      ? ((n || 0) / fxRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : (n || 0).toLocaleString(isFX ? "en-US" : "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

      <div className="bg-background p-5 space-y-4 text-[13px] leading-snug order-preview-body">
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
              <td className="border border-foreground px-2 py-1 w-1/2 align-top bg-muted/40 font-bold uppercase">Bill To</td>
              <td className="border border-foreground px-2 py-1 w-1/2 align-top bg-muted/40 font-bold uppercase">Ship To</td>
            </tr>
            <tr>
              <td className="border border-foreground px-2 py-1 align-top">
                <AddressCellContent addr={p.billTo} fallbackName={p.companyName} />
              </td>
              <td className="border border-foreground px-2 py-1 align-top">
                <AddressCellContent addr={ship} fallbackName={p.companyName} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items + Totals — unified bordered table; column set differs MR vs GMS */}
        {(() => {
          const isGMS = p.format === "GMS";
          const totalsColSpan = isGMS ? 7 : 6;
          const emptyColSpan = isGMS ? 8 : 7;
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
            <table className="w-full border-collapse text-[11px] border border-foreground">
              <thead>
                <tr className={isGMS ? "" : "bg-muted/60"} style={isGMS ? { backgroundColor: "rgb(220,220,220)" } : undefined}>
                  <th className="border border-foreground px-1.5 py-1 w-10 text-center">{isGMS ? "ITEM NO" : "S. No."}</th>
                  {isGMS && <th className="border border-foreground px-1.5 py-1 w-24 text-left">MODEL NUMBER</th>}
                  <th className="border border-foreground px-1.5 py-1 text-left">{isGMS ? "DESCRIPTION" : "Item Description"}</th>
                  <th className="border border-foreground px-1.5 py-1 w-20 text-center">{isGMS ? "HSN CODE" : "HSN Code"}</th>
                  <th className="border border-foreground px-1.5 py-1 w-12 text-center">{isGMS ? "QTY" : "Qty."}</th>
                  <th className="border border-foreground px-1.5 py-1 w-12 text-center">{isGMS ? "UNIT" : "Unit"}</th>
                  <th className="border border-foreground px-1.5 py-1 w-24 text-right">
                    {isGMS ? `UNIT PRICE (${itemCurLabel})` : `Rate${isFX ? ` (${fxSymbol})` : ""}`}
                  </th>
                  <th className="border border-foreground px-1.5 py-1 w-28 text-right">
                    {isGMS ? `AMOUNT (${itemCurLabel})` : `Amount${isFX ? ` (${fxSymbol})` : ""}`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.items.length === 0 || p.items.every((i) => !i.description && !i.amount) ? (
                  <tr>
                    <td colSpan={emptyColSpan} className="border border-foreground px-2 py-3 text-center italic text-muted-foreground">No line items yet</td>
                  </tr>
                ) : (
                  p.items.map((it, idx) => (
                    <tr key={it.id || idx} className="align-top">
                      <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{idx + 1}</td>
                      {isGMS && <td className="border border-foreground px-1.5 py-1"></td>}
                      <td className="border border-foreground px-1.5 py-1">
                        {it.description || <Placeholder text="(blank)" />}
                      </td>
                      <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.hsn_code || ""}</td>
                      <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.quantity || 0}</td>
                      <td className="border border-foreground px-1.5 py-1 text-center">{it.unit || "Nos"}</td>
                      <td className="border border-foreground px-1.5 py-1 text-right tabular-nums">
                        {itemFmt(it.unit_rate || 0)}
                      </td>
                      <td className="border border-foreground px-1.5 py-1 text-right tabular-nums">
                        {itemFmt(it.amount || 0)}
                      </td>
                    </tr>
                  ))
                )}
                {/* Inline totals rows (only for non-FX, non-Murthal — matches reference format) */}
                {!isFX && !isMurthal && !isTurkey && (
                  isGMS ? (
                    <>
                      <TotalsRow colSpan={totalsColSpan} label="Ex-works Murthal Price" value={p.totals.basic_total} />
                      {p.docMeta?.extraTotalsRows?.map((r, i) => (
                        <TotalsRow key={`xg${i}`} colSpan={totalsColSpan} label={r.label} value={r.value} highlight={r.bold} />
                      ))}
                      {!p.docMeta?.hideDefaultGrandTotal && (
                        <TotalsRow colSpan={totalsColSpan} label="Grand Total" value={p.totals.basic_total} highlight />
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
                          ? (grandShown * (p.charges.mr_advance_percent || 0)) / 100
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
        {!isFX && !isMurthal && !isTurkey && p.amountInWords && p.totals.net_payable > 0 && (
          <div className="text-[11px] font-semibold uppercase tracking-wide">
            AMOUNT (IN WORDS): {p.amountInWords.replace(/^INR\s*/i, "RS. ")}
          </div>
        )}

        {/* Specialised totals layouts (Ex-works Murthal & Ex-works FX) */}
        {isTurkey && turkey ? (
          <ExTurkeyBlock t={turkey} c={p.charges} fxSymbol={fxSymbol} fxRate={fxRate} isFX={isFX} basicFX={p.totals.basic_total} />
        ) : isMurthal && murthal ? (
          <ExMurthalBlock
            m={murthal}
            c={p.charges}
            fxSymbol={fxSymbol}
            fxRate={fxRate}
            isFX={isFX}
            basicFX={p.totals.basic_total}
          />
        ) : isFX ? (
          <div className="border rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1fr_auto_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">Price Ex-works {p.charges.currency}</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">{fxSymbol}</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {(p.totals.basic_total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center border-b">
              <div className="px-2 py-1.5 text-right font-bold">Amount in INR @{fxRate}</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">₹</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {inrAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] items-center">
              <div className="px-2 py-1.5 text-right font-bold">Advance Required @ {advancePct}%</div>
              <div className="px-2 py-1.5 border-l text-right font-semibold w-12">₹</div>
              <div className="px-2 py-1.5 border-l text-right font-bold tabular-nums w-32">
                {advanceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          <GMSFooter fxRate={fxRate} currency={p.charges.currency || "USD"} />
        )}
        {p.format === "GMS" && !p.docMeta?.hideFirstPageFooter && !isFX && (
          <GMSHeadOfficeBank />
        )}

        {p.format === "GMS" && p.gmsTerms && (
          <GMSTermsBlock
            t={p.gmsTerms}
            includeExclusions={!!p.docMeta?.hideFirstPageFooter}
            fxRate={fxRate}
            currency={p.charges.currency || "INR"}
            isFX={isFX}
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
  m, c, fxSymbol, fxRate, isFX, basicFX,
}: {
  m: ReturnType<typeof calcExMurthal>;
  c: Charges;
  fxSymbol: string;
  fxRate: number;
  isFX: boolean;
  basicFX: number;
}) {
  const displayUSD = c.display_currency === "USD" && (fxRate || 0) > 0;
  const inr = (n: number) =>
    `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usd = (n: number) =>
    `${fxSymbol || "$"} ${((n || 0) / (fxRate || 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtAmt = (n: number) => (displayUSD ? usd(n) : inr(n));
  const Row = ({ k, v, bold, sub }: { k: string; v: number; bold?: boolean; sub?: boolean }) => (
    <div className={`grid grid-cols-[1fr_auto] items-center border-b last:border-b-0 ${bold ? "bg-muted/40" : ""}`}>
      <div className={`px-2 py-1.5 ${sub ? "pl-6" : ""} ${bold ? "font-bold" : ""}`}>{k}</div>
      <div className={`px-2 py-1.5 border-l text-right tabular-nums w-40 ${bold ? "font-bold" : ""}`}>{fmtAmt(v)}</div>
    </div>
  );
  return (
    <div className="border rounded overflow-hidden text-xs">
      {displayUSD && (
        <div className="px-2 py-1.5 border-b bg-muted/30 text-[11px] italic">
          Showing totals in {c.currency || "USD"} ({fxSymbol || "$"}) — converted from INR @ ₹{fxRate} (cost-sheet rate). Underlying calculation is in INR.
        </div>
      )}
      {isFX && (
        <div className="grid grid-cols-[1fr_auto] items-center border-b bg-muted/30">
          <div className="px-2 py-1.5 italic">Ex-works {c.currency} {fxSymbol}{basicFX.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ₹{fxRate}</div>
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
      {c.sea_insurance_enabled && <Row k="Insurance" v={m.sea_insurance} />}
      {(c.murthal_pf_enabled || c.pf_amount > 0 || c.pf_percent > 0) && m.pf > 0 && (
        <Row k="P&F" v={m.pf} />
      )}
      {(c.murthal_freight_enabled || c.freight_enabled) && m.freight > 0 && (
        <Row k="Freight" v={m.freight} />
      )}
      {c.landed_gst_enabled && <Row k="GST" v={m.gst} />}
      <Row k="Grand Total" v={m.grand_total} bold />
      {c.landed_discount_enabled && m.discount > 0 && (
        <Row k="One-time Discount" v={-m.discount} />
      )}
      {c.murthal_advance_enabled && m.advance_amount > 0 && (
        <Row k="Advance Adjustment" v={-m.advance_amount} />
      )}
      <Row k="Net Payable" v={m.net_payable} bold />
    </div>
  );
}

function ExTurkeyBlock({
  t, c, fxSymbol, fxRate, isFX, basicFX,
}: {
  t: ReturnType<typeof calcExTurkey>;
  c: Charges;
  fxSymbol: string;
  fxRate: number;
  isFX: boolean;
  basicFX: number;
}) {
  // Phase 1: when user picks display_currency="USD" on a GMS Turkey OA/PI
  // and a cost-sheet $ rate is set, render the totals block in USD by
  // dividing each INR value by the rate. The math itself stays INR-based.
  const displayUSD = c.display_currency === "USD" && (fxRate || 0) > 0;
  const inr = (n: number) =>
    `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usd = (n: number) =>
    `${fxSymbol || "$"} ${((n || 0) / (fxRate || 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          Showing totals in {c.currency || "USD"} ({fxSymbol || "$"}) — converted from INR @ ₹{fxRate} (cost-sheet rate). Underlying calculation is in INR.
        </div>
      )}
      {isFX && (
        <div className="grid grid-cols-[1fr_auto] items-center border-b bg-muted/30">
          <div className="px-2 py-1.5 italic">EXW Turkey {c.currency} {fxSymbol}{basicFX.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ₹{fxRate}</div>
          <div className="px-2 py-1.5 border-l text-right tabular-nums w-40">{fmtAmt(t.base_amount)}</div>
        </div>
      )}
      <Row k="Base Amount (EXW Turkey)" v={t.base_amount} />
      {c.turkey_sea_freight_enabled && <Row k="Sea Freight" v={t.sea_freight} />}
      {c.turkey_custom_enabled && <Row k={customLbl} v={t.custom} />}
      <Row k="Landed Price" v={t.total_amount} bold />
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

function GMSHeadOfficeBank() {
  const bank = DEFAULT_GMS_BANK;
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

function GMSFooter({ fxRate, currency }: { fxRate: number; currency: string }) {
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
      <GMSHeadOfficeBank />
    </div>
  );
}

function GMSTermsBlock({
  t, includeExclusions, fxRate, currency, isFX,
}: {
  t: GMSTerms;
  includeExclusions?: boolean;
  fxRate?: number;
  currency?: string;
  isFX?: boolean;
}) {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-0.5">
      <div className="font-bold">{label}</div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  );
  return (
    <div className="border-t-2 border-foreground mt-3 pt-3 text-[11px] space-y-3 page-break-before">
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
      <GMSHeadOfficeBank />
    </div>
  );
}

function MRPostItems({ terms, bank, preparedBy }: { terms?: string; bank?: BankDetails; preparedBy?: string }) {
  return (
    <div className="space-y-0 text-[11px] border-t-2 border-foreground mt-2">
      {/* Amount in words band */}
      {/* Terms & Conditions */}
      <div className="border border-foreground border-t-0 px-2 py-1.5">
        <div className="font-bold uppercase italic mb-0.5">Terms &amp; Conditions</div>
        <div className="whitespace-pre-wrap leading-relaxed">{terms || ""}</div>
      </div>

      {/* Bank + Signature row */}
      <div className="grid grid-cols-2 border border-foreground border-t-0">
        <div className="px-2 py-1.5 border-r border-foreground">
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
        <div className="px-2 py-1.5 flex flex-col items-end justify-between min-h-[90px]">
          <div className="font-semibold italic">Yours faithfully</div>
          <div className="text-right">
            <div className="font-bold tracking-wide">M.R. ENGINEERS</div>
            {preparedBy && <div className="text-[10px] text-muted-foreground">{preparedBy}</div>}
          </div>
        </div>
      </div>

      {/* Small "M.R. ENGINEERS" label row above the yellow strip (matches PDF) */}
      <div className="border border-foreground border-t-0 px-2 py-1 text-right text-[10px] font-bold">
        M.R. ENGINEERS
      </div>

      {/* Footer address band */}
      <div className="bg-primary/90 text-primary-foreground text-center font-semibold uppercase tracking-wide px-2 py-1.5 text-[10px]">
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

function TotalsRow({ label, value, highlight, colSpan = 6 }: { label: string; value: number; highlight?: boolean; colSpan?: number }) {
  return (
    <tr className={highlight ? "bg-yellow-200/70" : ""}>
      <td colSpan={colSpan} className={`border border-foreground px-1.5 py-1 text-right ${highlight ? "font-bold" : "font-semibold"}`}>
        {label}
      </td>
      <td className={`border border-foreground px-1.5 py-1 text-right tabular-nums ${highlight ? "font-bold" : ""}`}>
        {value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      <div className="flex items-start justify-between gap-4">
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
            width={140}
            height={56}
            loading="lazy"
            className="h-14 w-auto object-contain"
          />
          <div className="text-[11px] font-bold mt-1">UGUR MACHINE, TURKEY</div>
          <div className="text-[9px] italic text-muted-foreground">
            Quality Standard is an Assurance of UGUR at all parts
          </div>
        </div>
      </div>
      {/* Grey ORDER ACCEPTANCE bar */}
      <div className="mt-2 py-1 text-center" style={{ backgroundColor: "rgb(200,200,200)" }}>
        <div className="text-sm font-bold tracking-[0.2em] text-black">{title || "ORDER ACCEPTANCE"}</div>
      </div>
      {/* Customer / OA meta — borderless two-column block */}
      <div className="grid grid-cols-2 gap-4 mt-3 text-[11px]">
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
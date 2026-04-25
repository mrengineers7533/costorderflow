import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";
import { calcExMurthal } from "@/lib/orders/calc";
import mrLogo from "@/assets/mr-logo.png";
import gmsLogo from "@/assets/gms-logo.png";
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
  const gstAmount = (p.totals.subtotal * (p.charges.gst_percent || 0)) / 100;
  const pfAmount = p.charges.pf_amount > 0
    ? p.charges.pf_amount
    : (p.totals.basic_total * (p.charges.pf_percent || 0)) / 100;
  const insuranceAmount = p.charges.insurance_percent > 0
    ? (p.totals.basic_total * p.charges.insurance_percent) / 100
    : (p.charges.insurance || 0);
  const discountAmount = p.charges.discount_percent > 0
    ? (p.totals.grand_total * p.charges.discount_percent) / 100
    : (p.charges.discount || 0);

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
            <MRHeader />
            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Field label="OA No." value={p.oaNumber || <Placeholder text="auto on save" />} />
              <Field label="Date" value={p.orderDate ? new Date(p.orderDate).toLocaleDateString("en-IN") : "—"} />
              <Field label="Reference" value={p.reference || <Placeholder />} />
              <Field label="Cost Sheet" value={p.costSheetNumber || <Placeholder />} />
            </div>
          </>
        ) : (
          <GMSHeader
            companyName={p.companyName}
            billTo={p.billTo}
            oaNumber={p.oaNumber}
            orderDate={p.orderDate}
            reference={p.reference}
            costSheetNumber={p.costSheetNumber}
            preparedBy={p.preparedBy}
          />
        )}

        {/* Addresses */}
        <div className="grid grid-cols-2 gap-3">
          <AddressBlock title="Bill To" addr={p.billTo} fallbackName={p.companyName} />
          <AddressBlock title="Ship To" addr={ship} fallbackName={p.companyName} />
        </div>

        {/* Items + Totals — unified bordered table matching reference template */}
        <table className="w-full border-collapse text-[11px] border border-foreground">
          <thead>
            <tr className="bg-muted/60">
              <th className="border border-foreground px-1.5 py-1 w-10 text-center">S. No.</th>
              <th className="border border-foreground px-1.5 py-1 text-left">Item Description</th>
              <th className="border border-foreground px-1.5 py-1 w-20 text-center">HSN Code</th>
              <th className="border border-foreground px-1.5 py-1 w-12 text-center">Qty.</th>
              <th className="border border-foreground px-1.5 py-1 w-12 text-center">Unit</th>
              <th className="border border-foreground px-1.5 py-1 w-24 text-right">Rate{isFX ? ` (${fxSymbol})` : ""}</th>
              <th className="border border-foreground px-1.5 py-1 w-28 text-right">Amount{isFX ? ` (${fxSymbol})` : ""}</th>
            </tr>
          </thead>
          <tbody>
            {p.items.length === 0 || p.items.every((i) => !i.description && !i.amount) ? (
              <tr>
                <td colSpan={7} className="border border-foreground px-2 py-3 text-center italic text-muted-foreground">No line items yet</td>
              </tr>
            ) : (
              p.items.map((it, idx) => (
                <tr key={it.id || idx} className="align-top">
                  <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{idx + 1}</td>
                  <td className="border border-foreground px-1.5 py-1">
                    {it.description || <Placeholder text="(blank)" />}
                  </td>
                  <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.hsn_code || ""}</td>
                  <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.quantity || 0}</td>
                  <td className="border border-foreground px-1.5 py-1 text-center">{it.unit || "Nos"}</td>
                  <td className="border border-foreground px-1.5 py-1 text-right tabular-nums">
                    {(it.unit_rate || 0).toLocaleString(isFX ? "en-US" : "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="border border-foreground px-1.5 py-1 text-right tabular-nums">
                    {(it.amount || 0).toLocaleString(isFX ? "en-US" : "en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
            {/* Inline totals rows (only for non-FX, non-Murthal — matches reference format) */}
            {!isFX && !isMurthal && (
              <>
                <TotalsRow label="Basic Total" value={p.totals.basic_total} />
                {(p.charges.pf_amount > 0 || p.charges.pf_percent > 0) && (
                  <TotalsRow label={`P&F${p.charges.pf_percent ? ` @ ${p.charges.pf_percent}%` : ""}`} value={pfAmount} />
                )}
                {insuranceAmount > 0 && (
                  <TotalsRow label={`Insurance${p.charges.insurance_percent ? ` @ ${p.charges.insurance_percent}%` : ""}`} value={insuranceAmount} />
                )}
                {p.charges.freight_enabled && p.charges.freight > 0 && (
                  <TotalsRow label="Freight" value={p.charges.freight} />
                )}
                <TotalsRow label="Subtotal" value={p.totals.subtotal} />
                <TotalsRow label={`GST @ ${p.charges.gst_percent || 0}%`} value={gstAmount} />
                {discountAmount > 0 && (
                  <TotalsRow label={`Discount${p.charges.discount_percent ? ` @ ${p.charges.discount_percent}%` : ""}`} value={-discountAmount} />
                )}
                <TotalsRow label="Grand Total" value={p.totals.net_payable} highlight />
              </>
            )}
          </tbody>
        </table>

        {/* Amount in words — sits between table and post sections (matches template) */}
        {!isFX && !isMurthal && p.amountInWords && p.totals.net_payable > 0 && (
          <div className="text-[11px] font-semibold uppercase tracking-wide">
            AMOUNT (IN WORDS): {p.amountInWords.replace(/^INR\s*/i, "RS. ")}
          </div>
        )}

        {/* Specialised totals layouts (Ex-works Murthal & Ex-works FX) */}
        {isMurthal && murthal ? (
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

        {p.format === "GMS" && isFX && (
          <GMSFooter fxRate={fxRate} currency={p.charges.currency || "USD"} />
        )}

        {p.format === "GMS" && p.gmsTerms && (
          <GMSTermsBlock t={p.gmsTerms} />
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
  const inr = (n: number) =>
    `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const Row = ({ k, v, bold, sub }: { k: string; v: number; bold?: boolean; sub?: boolean }) => (
    <div className={`grid grid-cols-[1fr_auto] items-center border-b last:border-b-0 ${bold ? "bg-muted/40" : ""}`}>
      <div className={`px-2 py-1.5 ${sub ? "pl-6" : ""} ${bold ? "font-bold" : ""}`}>{k}</div>
      <div className={`px-2 py-1.5 border-l text-right tabular-nums w-40 ${bold ? "font-bold" : ""}`}>{inr(v)}</div>
    </div>
  );
  return (
    <div className="border rounded overflow-hidden text-xs">
      {isFX && (
        <div className="grid grid-cols-[1fr_auto] items-center border-b bg-muted/30">
          <div className="px-2 py-1.5 italic">Ex-works {c.currency} {fxSymbol}{basicFX.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ ₹{fxRate}</div>
          <div className="px-2 py-1.5 border-l text-right tabular-nums w-40">{inr(m.base_amount)}</div>
        </div>
      )}
      <Row k="1. Base Amount" v={m.base_amount} />
      {c.hike_enabled && <Row k="2. Hike Amount" v={m.hike} />}
      {(c.pf_amount > 0 || c.pf_percent > 0) && (
        <Row k={`2a. P&F${c.pf_percent ? ` (${c.pf_percent}%)` : ""}`} v={m.pf} sub />
      )}
      {c.freight_enabled && <Row k="2b. Freight" v={m.freight} sub />}
      <Row k="3. Total Amount / Landed Price" v={m.total_amount} bold />
      {c.sea_freight_enabled && <Row k="4a. Sea Freight" v={m.sea_freight} />}
      {c.sea_insurance_enabled && <Row k="4b. Insurance" v={m.sea_insurance} />}
      {c.custom_enabled && (
        <Row k={`5. Custom Duty (${c.custom_percent ?? 8.25}%)`} v={m.custom} />
      )}
      {c.clearing_enabled && (
        <Row k={`6. Clearing Charge / CHA & Port (${c.clearing_percent ?? 1.5}%)`} v={m.clearing} />
      )}
      {c.landed_gst_enabled && (
        <Row k={`7. GST (${c.landed_gst_percent ?? 18}%)`} v={m.gst} />
      )}
      {c.landed_discount_enabled && m.discount > 0 && (
        <Row k="8. One-time Discount" v={-m.discount} />
      )}
      <Row k="Net Payable" v={m.net_payable} bold />
    </div>
  );
}

function GMSFooter({ fxRate, currency }: { fxRate: number; currency: string }) {
  const bank = DEFAULT_GMS_BANK;
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
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <div className="font-bold">HEAD OFFICE</div>
          {GMS_HEAD_OFFICE_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div>
          <div className="font-bold">Our Bank Details :</div>
          <div className="font-bold uppercase">GRAIIN MILLING SOLUTIONS</div>
          <div><span className="font-semibold">Bank :</span> {bank.bank_name}</div>
          <div><span className="font-semibold">Branch :</span> {bank.branch}</div>
          <div><span className="font-semibold">A/C No :</span> {bank.account_no}</div>
          <div><span className="font-semibold">IFSC CODE :</span> {bank.ifsc}</div>
        </div>
      </div>
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

function TotalsRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-yellow-200/70" : ""}>
      <td colSpan={6} className={`border border-foreground px-1.5 py-1 text-right ${highlight ? "font-bold" : "font-semibold"}`}>
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

function MRHeader() {
  return (
    <div className="border-b pb-3">
      <div className="flex items-center gap-4">
        <img
          src={mrLogo}
          alt="MR Engineers logo"
          width={64}
          height={64}
          loading="lazy"
          className="h-16 w-16 shrink-0 object-contain"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xl font-extrabold tracking-tight text-primary leading-tight">
            M.R. ENGINEERS PVT. LTD.
          </div>
          <div className="text-[11px] text-muted-foreground italic">
            Manufacturers of Material Handling Equipment & EOT Cranes
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Plot No. 7, Sector-3, IMT Manesar, Gurgaon - 122051, Haryana, India
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wide rounded-sm bg-primary/10 text-foreground px-2 py-1.5 border border-primary/20">
        <div><span className="text-muted-foreground">GSTIN:</span> <span className="font-semibold">06AABCM3429K1ZP</span></div>
        <div className="text-center"><span className="text-muted-foreground">Tel:</span> <span className="font-semibold">+91-124-4374444</span></div>
        <div className="text-right"><span className="text-muted-foreground">Email:</span> <span className="font-semibold normal-case">info@mrengineers.com</span></div>
      </div>
      <div className="text-center mt-2">
        <div className="text-sm font-bold tracking-[0.2em] text-foreground">ORDER ACCEPTANCE</div>
      </div>
    </div>
  );
}

function GMSHeader({
  companyName, billTo, oaNumber, orderDate, reference, costSheetNumber, preparedBy,
}: {
  companyName: string; billTo: Address; oaNumber: string; orderDate: string;
  reference: string; costSheetNumber: string; preparedBy: string;
}) {
  const customerName = billTo?.name || companyName;
  const addressLine = billTo?.address?.split("\n")[0] || "";
  const dateStr = orderDate ? new Date(orderDate).toLocaleDateString("en-IN") : "—";
  return (
    <div className="space-y-0">
      {/* Logo + company name */}
      <div className="flex flex-col items-center pb-2">
        <img
          src={gmsLogo}
          alt="GMS Grain Milling Solutions logo"
          width={120}
          height={120}
          loading="lazy"
          className="h-20 w-auto object-contain"
        />
        <div className="text-base font-extrabold tracking-tight mt-1">
          GRAIN MILLING SOLUTIONS PVT. LTD.
        </div>
      </div>
      {/* ORDER ACCEPTANCE band */}
      <div className="bg-gradient-to-r from-muted via-background to-muted border-y border-foreground/40 py-1 text-center">
        <div className="text-sm font-bold tracking-[0.2em]">ORDER ACCEPTANCE</div>
      </div>
      {/* Customer / OA meta two-column block */}
      <div className="grid grid-cols-2 gap-4 pt-3 text-xs">
        <div className="space-y-0.5">
          <div className="font-semibold">{customerName ? `M/s ${customerName}` : <Placeholder text="customer" />}</div>
          {addressLine && <div>{addressLine}</div>}
          {billTo?.contact_person && <div><span className="font-semibold">Contact Person:-</span> {billTo.contact_person}</div>}
          {billTo?.contact_number && <div><span className="font-semibold">Contact No:-</span> {billTo.contact_number}</div>}
          {billTo?.email && <div><span className="font-semibold">Email :-</span> {billTo.email}</div>}
        </div>
        <div className="space-y-0.5 text-right">
          <div><span className="font-semibold">Date :</span> {dateStr}</div>
          <div><span className="font-semibold">OA No.:</span> {oaNumber || <Placeholder text="auto on save" />}</div>
          <div><span className="font-semibold">Ref. :</span> {reference || costSheetNumber || <Placeholder />}</div>
          {preparedBy && <div><span className="font-semibold">Prepared By:-</span> {preparedBy}</div>}
        </div>
      </div>
    </div>
  );
}
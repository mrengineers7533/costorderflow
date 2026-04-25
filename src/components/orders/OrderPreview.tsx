import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";
import mrLogo from "@/assets/mr-logo.png";
import gmsLogo from "@/assets/gms-logo.png";
import { MR_FOOTER_ADDRESS, type BankDetails } from "@/lib/orders/defaults";

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
}

const fmt = (n: number) =>
  `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderPreview(p: Props) {
  const ship = p.sameAsBill ? p.billTo : p.shipTo;
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

        {/* Items */}
        <div className="border rounded">
          <div className="grid grid-cols-12 gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase bg-muted/40 border-b">
            <div className="col-span-1">S.No.</div>
            <div className="col-span-5">Description</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-3 text-right">Amount</div>
          </div>
          {p.items.length === 0 || p.items.every((i) => !i.description && !i.amount) ? (
            <div className="px-2 py-3 text-xs text-muted-foreground italic text-center">No line items yet</div>
          ) : (
            p.items.map((it, idx) => (
              <div key={it.id || idx} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-b last:border-b-0 text-xs">
                <div className="col-span-1 tabular-nums text-muted-foreground">{idx + 1}</div>
                <div className="col-span-5">
                  <div className="truncate" title={it.description}>{it.description || <Placeholder text="(blank)" />}</div>
                  {it.hsn_code && <div className="text-[10px] text-muted-foreground">HSN {it.hsn_code}</div>}
                </div>
                <div className="col-span-1 text-right tabular-nums">{it.quantity || 0}</div>
                <div className="col-span-2 text-right tabular-nums">{(it.unit_rate || 0).toLocaleString("en-IN")}</div>
                <div className="col-span-3 text-right tabular-nums font-medium">{fmt(it.amount || 0)}</div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="space-y-1 text-xs">
          <Line k="Basic Total" v={p.totals.basic_total} />
          {(p.charges.pf_amount > 0 || p.charges.pf_percent > 0) && (
            <Line k={`P&F${p.charges.pf_percent ? ` (${p.charges.pf_percent}%)` : ""}`} v={pfAmount} />
          )}
          {insuranceAmount > 0 && (
            <Line k={`Insurance${p.charges.insurance_percent ? ` (${p.charges.insurance_percent}%)` : ""}`} v={insuranceAmount} />
          )}
          {p.charges.freight_enabled && p.charges.freight > 0 && <Line k="Freight" v={p.charges.freight} />}
          <Line k="Subtotal" v={p.totals.subtotal} />
          <Line k={`GST (${p.charges.gst_percent || 0}%)`} v={gstAmount} />
          <Line k="Grand Total" v={p.totals.grand_total} bold />
          {discountAmount > 0 && (
            <Line k={`Discount${p.charges.discount_percent ? ` (${p.charges.discount_percent}%)` : ""}`} v={-discountAmount} />
          )}
          <div className="border-t pt-1">
            <Line k="Net Payable" v={p.totals.net_payable} bold />
          </div>
          {p.amountInWords && p.totals.net_payable > 0 && (
            <div className="pt-1 text-[11px] italic text-muted-foreground">{p.amountInWords}</div>
          )}
        </div>

        {p.notes && (
          <div className="text-xs">
            <div className="font-semibold mb-0.5">Notes</div>
            <div className="whitespace-pre-wrap text-muted-foreground">{p.notes}</div>
          </div>
        )}

        {p.format === "MR" && <MRPostItems terms={p.terms} bank={p.bank} preparedBy={p.preparedBy} />}

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
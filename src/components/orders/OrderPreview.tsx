import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Address, Charges, LineItem, OrderFormat, Totals } from "@/lib/orders/types";

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
}

const fmt = (n: number) =>
  `₹ ${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderPreview(p: Props) {
  const ship = p.sameAsBill ? p.billTo : p.shipTo;
  const gstAmount = (p.totals.subtotal * (p.charges.gst_percent || 0)) / 100;
  const pfAmount = p.charges.pf_amount > 0
    ? p.charges.pf_amount
    : (p.totals.basic_total * (p.charges.pf_percent || 0)) / 100;

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Live Preview</div>
        {p.parsing ? (
          <Badge variant="default" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
            Updating…
          </Badge>
        ) : (
          <Badge variant="secondary">{p.format}</Badge>
        )}
      </div>

      <div className="bg-background p-5 space-y-4 text-[13px] leading-snug">
        {/* Header */}
        <div className="text-center space-y-0.5 border-b pb-3">
          <div className="font-bold text-base">
            {p.format === "MR" ? "MR Engineers" : "GMS"}
          </div>
          <div className="text-xs text-muted-foreground">Order Acceptance</div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <Field label="OA No." value={p.oaNumber || <Placeholder text="auto on save" />} />
          <Field label="Date" value={p.orderDate ? new Date(p.orderDate).toLocaleDateString("en-IN") : "—"} />
          <Field label="Reference" value={p.reference || <Placeholder />} />
          <Field label="Cost Sheet" value={p.costSheetNumber || <Placeholder />} />
        </div>

        {/* Addresses */}
        <div className="grid grid-cols-2 gap-3">
          <AddressBlock title="Bill To" addr={p.billTo} fallbackName={p.companyName} />
          <AddressBlock title="Ship To" addr={ship} fallbackName={p.companyName} />
        </div>

        {/* Items */}
        <div className="border rounded">
          <div className="grid grid-cols-12 gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase bg-muted/40 border-b">
            <div className="col-span-6">Description</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate</div>
            <div className="col-span-3 text-right">Amount</div>
          </div>
          {p.items.length === 0 || p.items.every((i) => !i.description && !i.amount) ? (
            <div className="px-2 py-3 text-xs text-muted-foreground italic text-center">No line items yet</div>
          ) : (
            p.items.map((it, idx) => (
              <div key={it.id || idx} className="grid grid-cols-12 gap-1 px-2 py-1.5 border-b last:border-b-0 text-xs">
                <div className="col-span-6">
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
          {p.charges.insurance > 0 && <Line k="Insurance" v={p.charges.insurance} />}
          {p.charges.freight_enabled && p.charges.freight > 0 && <Line k="Freight" v={p.charges.freight} />}
          <Line k="Subtotal" v={p.totals.subtotal} />
          <Line k={`GST (${p.charges.gst_percent || 0}%)`} v={gstAmount} />
          <Line k="Grand Total" v={p.totals.grand_total} bold />
          {p.charges.discount > 0 && <Line k="Discount" v={-p.charges.discount} />}
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

        {p.preparedBy && (
          <div className="text-xs text-right pt-2 border-t">
            <div className="text-muted-foreground">Prepared by</div>
            <div className="font-medium">{p.preparedBy}</div>
          </div>
        )}
      </div>
    </Card>
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
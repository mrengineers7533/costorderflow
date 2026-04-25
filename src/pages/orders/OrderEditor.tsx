import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Download, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Address, Charges, LineItem, OrderFormat, OrderRecord } from "@/lib/orders/types";
import { amountInWords, calcLineAmount, calcTotals, detectFormat, getFinancialYear } from "@/lib/orders/calc";
import { generateOrderPDF } from "@/lib/orders/pdf";

const emptyAddress: Address = { name: "", address: "", gstin: "", state: "", state_code: "" };
const emptyCharges: Charges = {
  pf_percent: 2, pf_amount: 0, insurance: 0,
  freight_enabled: false, freight: 0,
  gst_percent: 18, gst_amount: 0, discount: 0,
};

export default function OrderEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [orderId, setOrderId] = useState<string | null>(null);
  const [oaNumber, setOaNumber] = useState<string>("");
  const [format, setFormat] = useState<OrderFormat>("MR");
  const [autoFormat, setAutoFormat] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [billTo, setBillTo] = useState<Address>(emptyAddress);
  const [shipTo, setShipTo] = useState<Address>(emptyAddress);
  const [sameAsBill, setSameAsBill] = useState(true);
  const [reference, setReference] = useState("");
  const [costSheetNumber, setCostSheetNumber] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState<LineItem[]>([newItem()]);
  const [charges, setCharges] = useState<Charges>(emptyCharges);
  const [notes, setNotes] = useState("");

  function newItem(): LineItem {
    return { id: crypto.randomUUID(), description: "", hsn_code: "", quantity: 1, unit_rate: 0, amount: 0 };
  }

  // Load existing
  useEffect(() => {
    if (isNew) return;
    supabase.from("orders").select("*").eq("id", id!).maybeSingle().then(({ data, error }) => {
      if (error || !data) {
        toast({ title: "Not found", variant: "destructive" });
        navigate("/orders");
        return;
      }
      const o = data as unknown as OrderRecord;
      setOrderId(o.id); setOaNumber(o.oa_number); setFormat(o.format); setAutoFormat(false);
      setCompanyName(o.company_name || ""); setBillTo(o.bill_to || emptyAddress);
      setShipTo(o.ship_to || emptyAddress); setSameAsBill(JSON.stringify(o.bill_to) === JSON.stringify(o.ship_to));
      setReference(o.reference || ""); setCostSheetNumber(o.cost_sheet_number || "");
      setOrderDate(o.order_date); setPreparedBy(o.prepared_by || "");
      setItems(o.line_items?.length ? o.line_items : [newItem()]);
      setCharges({ ...emptyCharges, ...o.charges });
      setNotes(o.notes || "");
      setLoading(false);
    });
  }, [id, isNew, navigate]);

  // Auto format from company
  useEffect(() => {
    if (autoFormat && companyName) setFormat(detectFormat(companyName));
  }, [companyName, autoFormat]);

  // Recompute amounts
  const itemsWithAmounts = useMemo(
    () => items.map((it) => ({ ...it, amount: calcLineAmount(it.quantity, it.unit_rate) })),
    [items]
  );
  const totals = useMemo(() => calcTotals(itemsWithAmounts, charges), [itemsWithAmounts, charges]);
  const words = useMemo(() => amountInWords(totals.net_payable), [totals.net_payable]);

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.length === 1 ? [newItem()] : prev.filter((_, i) => i !== idx));
  }

  async function save(finalize: boolean) {
    setSaving(true);
    const ship = sameAsBill ? billTo : shipTo;
    let oa = oaNumber;
    if (isNew && !oa) {
      const fy = getFinancialYear(new Date(orderDate));
      const { data, error } = await supabase.rpc("next_oa_number", { _format: format, _financial_year: fy });
      if (error) { setSaving(false); return toast({ title: "OA number failed", description: error.message, variant: "destructive" }); }
      oa = data as string;
      setOaNumber(oa);
    }
    const userRes = await supabase.auth.getUser();
    if (!userRes.data.user) { setSaving(false); return toast({ title: "Not signed in", variant: "destructive" }); }

    const payload = {
      user_id: userRes.data.user.id,
      oa_number: oa, format, status: finalize ? "finalized" as const : "draft" as const,
      company_name: companyName, bill_to: billTo, ship_to: ship,
      reference, cost_sheet_number: costSheetNumber, order_date: orderDate, prepared_by: preparedBy,
      line_items: itemsWithAmounts, charges, totals, amount_in_words: words, notes,
    } as never; void 0; const _payload = payload;
    /*
    };

    const res = isNew
      ? await supabase.from("orders").insert(payload).select().single()
      : await supabase.from("orders").update(payload).eq("id", orderId!).select().single();

    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    toast({ title: "Saved", description: `OA ${oa}` });
    if (isNew) navigate(`/orders/${res.data.id}`, { replace: true });
  }

  function downloadPDF() {
    const record: OrderRecord = {
      id: orderId || "preview", user_id: "", oa_number: oaNumber || "PREVIEW",
      format, status: "draft", company_name: companyName, bill_to: billTo,
      ship_to: sameAsBill ? billTo : shipTo, reference, cost_sheet_number: costSheetNumber,
      order_date: orderDate, prepared_by: preparedBy, line_items: itemsWithAmounts,
      charges, totals, amount_in_words: words, notes, created_at: "", updated_at: "",
    };
    const doc = generateOrderPDF(record);
    doc.save(`${(oaNumber || "OA").replace(/[/\\]/g, "_")}.pdf`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/orders")}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadPDF}><Download className="mr-2 h-4 w-4" />PDF</Button>
            <Button variant="secondary" disabled={saving} onClick={() => save(false)}>Save Draft</Button>
            <Button disabled={saving} onClick={() => save(true)}>Finalize</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div><Label>OA Number</Label><Input value={oaNumber} placeholder="Auto-generated on save" onChange={(e) => setOaNumber(e.target.value)} /></div>
            <div>
              <Label>Format</Label>
              <div className="flex gap-2 items-center">
                <Select value={format} onValueChange={(v) => { setAutoFormat(false); setFormat(v as OrderFormat); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MR">MR Engineers</SelectItem>
                    <SelectItem value="GMS">GMS</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <Switch checked={autoFormat} onCheckedChange={setAutoFormat} /> Auto
                </div>
              </div>
            </div>
            <div><Label>Company / Customer Name</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. customer enquiry no." /></div>
            <div><Label>Cost Sheet Number</Label><Input value={costSheetNumber} onChange={(e) => setCostSheetNumber(e.target.value)} placeholder="CS/2026-27/001" /></div>
            <div><Label>Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Prepared By</Label><Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <AddressCard title="Bill To" value={billTo} onChange={setBillTo} />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Ship To</CardTitle>
              <div className="flex items-center gap-2 text-sm"><Switch checked={sameAsBill} onCheckedChange={setSameAsBill} />Same as Bill To</div>
            </CardHeader>
            {!sameAsBill && (
              <CardContent className="space-y-2">
                <AddressFields value={shipTo} onChange={setShipTo} />
              </CardContent>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Line Items</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setItems([...items, newItem()])}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">HSN</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Unit Rate</div>
                <div className="col-span-2 text-right">Amount</div>
              </div>
              {itemsWithAmounts.map((it, idx) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-5" value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} placeholder="Item description" />
                  <Input className="col-span-2" value={it.hsn_code} onChange={(e) => updateItem(idx, { hsn_code: e.target.value })} placeholder="HSN" />
                  <Input className="col-span-1" type="number" step="any" value={it.quantity} onChange={(e) => updateItem(idx, { quantity: +e.target.value })} />
                  <Input className="col-span-2" type="number" step="any" value={it.unit_rate} onChange={(e) => updateItem(idx, { unit_rate: +e.target.value })} />
                  <div className="col-span-1 text-right font-medium">{it.amount.toFixed(2)}</div>
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Charges & Totals</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <NumberField label="P&F %" value={charges.pf_percent} onChange={(v) => setCharges({ ...charges, pf_percent: v, pf_amount: 0 })} />
              <NumberField label="P&F Amount (override)" value={charges.pf_amount} onChange={(v) => setCharges({ ...charges, pf_amount: v, pf_percent: 0 })} />
              <NumberField label="Insurance" value={charges.insurance} onChange={(v) => setCharges({ ...charges, insurance: v })} />
              <div className="flex items-center gap-3">
                <Switch checked={charges.freight_enabled} onCheckedChange={(b) => setCharges({ ...charges, freight_enabled: b })} />
                <Label>Include Freight</Label>
              </div>
              {charges.freight_enabled && <NumberField label="Freight" value={charges.freight} onChange={(v) => setCharges({ ...charges, freight: v })} />}
              <NumberField label="GST %" value={charges.gst_percent} onChange={(v) => setCharges({ ...charges, gst_percent: v, gst_amount: 0 })} />
              <NumberField label="One-time Discount" value={charges.discount} onChange={(v) => setCharges({ ...charges, discount: v })} />
            </div>
            <div className="rounded-lg border p-4 space-y-2 bg-card">
              <Row k="Basic Total" v={totals.basic_total} />
              <Row k="Subtotal" v={totals.subtotal} />
              <Row k={`GST (${charges.gst_percent}%)`} v={(totals.subtotal * charges.gst_percent) / 100} />
              <Row k="Grand Total" v={totals.grand_total} bold />
              {charges.discount > 0 && <Row k="Discount" v={-charges.discount} />}
              <Row k="Net Payable" v={totals.net_payable} bold />
              <div className="pt-2 text-sm text-muted-foreground italic">{words}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></CardContent>
        </Card>
      </div>
    </div>
  );
}

function AddressCard({ title, value, onChange }: { title: string; value: Address; onChange: (a: Address) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2"><AddressFields value={value} onChange={onChange} /></CardContent>
    </Card>
  );
}
function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  return (
    <>
      <div><Label>Name</Label><Input value={value.name || ""} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
      <div><Label>Address</Label><Textarea rows={2} value={value.address || ""} onChange={(e) => onChange({ ...value, address: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label>GSTIN</Label><Input value={value.gstin || ""} onChange={(e) => onChange({ ...value, gstin: e.target.value })} /></div>
        <div><Label>State</Label><Input value={value.state || ""} onChange={(e) => onChange({ ...value, state: e.target.value })} /></div>
      </div>
    </>
  );
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div><Label>{label}</Label><Input type="number" step="any" value={value} onChange={(e) => onChange(+e.target.value || 0)} /></div>;
}
function Row({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-base" : "text-sm"}`}><span>{k}</span><span>₹ {v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>;
}

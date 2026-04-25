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
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { Address, Charges, LineItem, OrderFormat, OrderRecord } from "@/lib/orders/types";
import { amountInWords, calcLineAmount, calcTotals, detectFormat, getFinancialYear, inferItemMake } from "@/lib/orders/calc";
import { generateOrderPDF } from "@/lib/orders/pdf";
import { fetchTemplate, generateOrderPDFFromTemplate, downloadBytes } from "@/lib/orders/templatePdf";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";
import { OrderPreview } from "@/components/orders/OrderPreview";

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
  const [parsing, setParsing] = useState(false);

  function newItem(): LineItem {
    return { id: crypto.randomUUID(), description: "", hsn_code: "", quantity: 1, unit_rate: 0, amount: 0, make: "MR" };
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

  // Auto format from company name AND line items (any "GMS" mention → GMS).
  useEffect(() => {
    if (!autoFormat) return;
    setFormat(detectFormat(companyName, items));
  }, [companyName, items, autoFormat]);

  // Recompute amounts (full set, all makes)
  const allItemsWithAmounts = useMemo(
    () => items.map((it) => ({
      ...it,
      make: it.make || inferItemMake(it),
      amount: calcLineAmount(it.quantity, it.unit_rate),
    })),
    [items]
  );

  // Items visible / printed for the currently selected OA format.
  // If the cost sheet has both MR and GMS items, only items matching the
  // current format render in this OA — switch the Format dropdown to see
  // (and download) the other one.
  const hasMR = allItemsWithAmounts.some((i) => i.make === "MR");
  const hasGMS = allItemsWithAmounts.some((i) => i.make === "GMS");
  const splitMode = hasMR && hasGMS;
  const itemsWithAmounts = useMemo(
    () => splitMode
      ? allItemsWithAmounts.filter((i) => i.make === format)
      : allItemsWithAmounts,
    [allItemsWithAmounts, splitMode, format]
  );
  const totals = useMemo(() => calcTotals(itemsWithAmounts, charges), [itemsWithAmounts, charges]);
  const words = useMemo(() => amountInWords(totals.net_payable), [totals.net_payable]);

  function updateItemById(itemId: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }
  function removeItemById(itemId: string) {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== itemId);
      return next.length === 0 ? [newItem()] : next;
    });
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
    };

    const res = isNew
      ? await supabase.from("orders").insert(payload as never).select().single()
      : await supabase.from("orders").update(payload as never).eq("id", orderId!).select().single();

    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    toast({ title: "Saved", description: `OA ${oa}` });
    if (isNew) navigate(`/orders/${res.data.id}`, { replace: true });
  }

  async function downloadPDF() {
    const record: OrderRecord = {
      id: orderId || "preview", user_id: "", oa_number: oaNumber || "PREVIEW",
      format, status: "draft", company_name: companyName, bill_to: billTo,
      ship_to: sameAsBill ? billTo : shipTo, reference, cost_sheet_number: costSheetNumber,
      order_date: orderDate, prepared_by: preparedBy, line_items: itemsWithAmounts,
      charges, totals, amount_in_words: words, notes, created_at: "", updated_at: "",
    };
    const filename = `${(oaNumber || "OA").replace(/[/\\]/g, "_")}.pdf`;
    try {
      const tpl = await fetchTemplate(format);
      if (tpl && Object.keys(tpl.field_map || {}).length > 0) {
        const bytes = await generateOrderPDFFromTemplate(record, tpl);
        downloadBytes(bytes, filename);
        toast({ title: "PDF generated", description: `Using ${format} template` });
        return;
      }
    } catch (err) {
      console.error("Template render failed, falling back:", err);
      toast({ title: "Template render failed", description: "Falling back to default layout.", variant: "destructive" });
    }
    const doc = generateOrderPDF(record);
    doc.save(filename);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  function applyCostSheet(data: ExtractedCostSheet) {
    if (data.company_name) setCompanyName(data.company_name);
    if (data.bill_to) setBillTo({ ...emptyAddress, ...billTo, ...data.bill_to });
    if (data.ship_to && (data.ship_to.name || data.ship_to.address)) {
      setShipTo({ ...emptyAddress, ...shipTo, ...data.ship_to });
      setSameAsBill(false);
    }
    if (data.cost_sheet_number) setCostSheetNumber(data.cost_sheet_number);
    if (data.reference) setReference(data.reference);
    if (data.line_items?.length) {
      setItems(
        data.line_items.map((it) => {
          const base = {
            description: it.description || "",
            hsn_code: it.hsn_code || "",
          };
          const make = (it as { make?: "MR" | "GMS" | "OTHER" }).make
            || inferItemMake(base);
          return {
            id: crypto.randomUUID(),
            ...base,
            quantity: Number(it.quantity) || 0,
            unit_rate: Number(it.unit_rate) || 0,
            amount: Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.unit_rate) || 0),
            make,
          };
        })
      );
    }
    if (data.charges) {
      setCharges((c) => ({
        ...c,
        pf_percent: data.charges?.pf_percent ?? c.pf_percent,
        pf_amount: data.charges?.pf_amount ?? c.pf_amount,
        insurance: data.charges?.insurance ?? c.insurance,
        freight: data.charges?.freight ?? c.freight,
        freight_enabled: (data.charges?.freight ?? 0) > 0 ? true : c.freight_enabled,
        gst_percent: data.charges?.gst_percent ?? c.gst_percent,
        discount: data.charges?.discount ?? c.discount,
      }));
    }
    if (data.notes) setNotes(data.notes);
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/orders")}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadPDF}><Download className="mr-2 h-4 w-4" />PDF</Button>
            <Button variant="secondary" disabled={saving} onClick={() => save(false)}>Save Draft</Button>
            <Button disabled={saving} onClick={() => save(true)}>Finalize</Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4 min-w-0">
            {isNew && <CostSheetPicker onApply={applyCostSheet} onParsingChange={setParsing} />}

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
            <Button size="sm" variant="outline" onClick={() => setItems([...items, { ...newItem(), make: format }])}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </CardHeader>
          <CardContent>
            {splitMode && (
              <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium">This cost sheet has both MR and GMS items.</div>
                <div className="text-muted-foreground">Showing only <span className="font-semibold">{format}</span> items in this OA. Switch the Format dropdown above to view, edit, and download the {format === "MR" ? "GMS" : "MR"} OA.</div>
              </div>
            )}
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <div className="col-span-4">Description</div>
                <div className="col-span-2">HSN</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Unit Rate</div>
                <div className="col-span-1">Make</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1" />
              </div>
              {itemsWithAmounts.map((it) => (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-4" value={it.description} onChange={(e) => updateItemById(it.id, { description: e.target.value })} placeholder="Item description" />
                  <Input className="col-span-2" value={it.hsn_code} onChange={(e) => updateItemById(it.id, { hsn_code: e.target.value })} placeholder="HSN" />
                  <Input className="col-span-1" type="number" step="any" value={it.quantity} onChange={(e) => updateItemById(it.id, { quantity: +e.target.value })} />
                  <Input className="col-span-2" type="number" step="any" value={it.unit_rate} onChange={(e) => updateItemById(it.id, { unit_rate: +e.target.value })} />
                  <Select value={it.make || "MR"} onValueChange={(v) => updateItemById(it.id, { make: v as "MR" | "GMS" | "OTHER" })}>
                    <SelectTrigger className="col-span-1 h-9 px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MR">MR</SelectItem>
                      <SelectItem value="GMS">GMS</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="col-span-1 text-right font-medium">{it.amount.toFixed(2)}</div>
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeItemById(it.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {itemsWithAmounts.length === 0 && (
                <div className="text-sm text-muted-foreground italic px-1 py-4">No {format} items. Switch format or add one.</div>
              )}
              {splitMode && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Hidden from this OA: {allItemsWithAmounts.length - itemsWithAmounts.length} item(s) with make = {format === "MR" ? "GMS" : "MR"}.
                </div>
              )}
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

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <OrderPreview
              oaNumber={oaNumber}
              format={format}
              companyName={companyName}
              billTo={billTo}
              shipTo={shipTo}
              sameAsBill={sameAsBill}
              reference={reference}
              costSheetNumber={costSheetNumber}
              orderDate={orderDate}
              preparedBy={preparedBy}
              items={itemsWithAmounts}
              charges={charges}
              totals={totals}
              amountInWords={words}
              notes={notes}
              parsing={parsing}
            />
          </aside>
        </div>
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

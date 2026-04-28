import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Trash2, Plus, Download, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Address, Charges, LineItem, OrderFormat, OrderRecord } from "@/lib/orders/types";
import { amountInWords, calcLineAmount, calcTotals, detectFormat, getFinancialYear, inferItemMake, splitItemsByMake } from "@/lib/orders/calc";
import { generateOrderPDF } from "@/lib/orders/pdf";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";
import { OrderPreview } from "@/components/orders/OrderPreview";
import { DEFAULT_MR_BANK, DEFAULT_MR_TERMS, DEFAULT_GMS_TERMS, type BankDetails, type GMSTerms } from "@/lib/orders/defaults";

const emptyAddress: Address = { name: "", address: "", gstin: "", state: "", state_code: "" };
const emptyCharges: Charges = {
  pf_percent: 1.5, pf_amount: 0, insurance: 0, insurance_percent: 0.071,
  freight_enabled: false, freight: 0,
  gst_percent: 18, gst_amount: 0, discount: 0, discount_percent: 0,
};

export default function OrderEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [terms, setTerms] = useState<string>(DEFAULT_MR_TERMS);
  const [bank, setBank] = useState<BankDetails>(DEFAULT_MR_BANK);
  const [gmsTerms, setGmsTerms] = useState<GMSTerms>(DEFAULT_GMS_TERMS);
  // Editor-only filter for the Line Items table. Does NOT affect the OA
  // format / preview / PDF — those still follow the Format dropdown above.
  const [lineItemsView, setLineItemsView] = useState<"MR" | "GMS" | "ALL">("ALL");

  function newItem(): LineItem {
    return { id: crypto.randomUUID(), description: "", hsn_code: "", quantity: 1, unit: "Nos", unit_rate: 0, amount: 0, make: "MR" };
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

  // Pre-fill from extracted cost sheet passed via router state (from chooser page).
  useEffect(() => {
    if (!isNew) return;
    const extracted = (location.state as { extracted?: ExtractedCostSheet } | null)?.extracted;
    if (!extracted) return;
    applyCostSheet(extracted);
    // Clear router state so refresh / back doesn't re-apply.
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // List used by the editor table — filtered by the in-section toggle.
  const editorItems = useMemo(
    () => lineItemsView === "ALL"
      ? allItemsWithAmounts
      : allItemsWithAmounts.filter((i) => i.make === lineItemsView),
    [allItemsWithAmounts, lineItemsView]
  );
  // Keep the editor view in sync with the OA format when the order has both
  // makes — first time we detect a split, default the toggle to the current
  // format so behavior matches what users saw before.
  useEffect(() => {
    if (splitMode && lineItemsView === "ALL") setLineItemsView(format);
    if (!splitMode && lineItemsView !== "ALL") setLineItemsView("ALL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode]);
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
    const payload = {
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
    const baseName = (oaNumber || "OA").replace(/[/\\]/g, "_");
    const ship = sameAsBill ? billTo : shipTo;

    // Render one PDF for a given format + item subset.
    const renderOne = async (fmt: OrderFormat, subsetItems: LineItem[], suffix: string) => {
      const subTotals = calcTotals(subsetItems, charges);
      const subWords = amountInWords(subTotals.net_payable);
      const record: OrderRecord = {
        id: orderId || "preview", user_id: "", oa_number: oaNumber || "PREVIEW",
        format: fmt, status: "draft", company_name: companyName, bill_to: billTo,
        ship_to: ship, reference, cost_sheet_number: costSheetNumber,
        order_date: orderDate, prepared_by: preparedBy, line_items: subsetItems,
        charges, totals: subTotals, amount_in_words: subWords, notes,
        created_at: "", updated_at: "",
      };
      const filename = `${baseName}${suffix}.pdf`;
      const doc = await generateOrderPDF(record, { terms, bank });
      doc.save(filename);
      return { used: "default" as const };
    };

    if (splitMode) {
      // Mixed makes detected — only download the format the user has selected,
      // using that format's items only.
      const { mr, gms } = splitItemsByMake(allItemsWithAmounts);
      const subset = format === "MR" ? mr : gms;
      await renderOne(format, subset, `-${format}`);
      toast({ title: "PDF generated", description: `${format} PDF downloaded` });
      return;
    }

    await renderOne(format, itemsWithAmounts, "");
    toast({ title: "PDF generated", description: `${format} PDF downloaded` });
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
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="rounded-lg">
              <ArrowLeft className="mr-1 h-4 w-4" />Orders
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Order Acceptance</div>
              <div className="flex items-center gap-2">
                <div className="font-mono font-semibold truncate">{oaNumber || "New Order"}</div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                  {format}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="rounded-lg"
              onClick={() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth" })}
            >
              Jump to Preview
            </Button>
            <Button variant="secondary" className="rounded-lg" disabled={saving} onClick={() => save(false)}>Save Draft</Button>
            <Button className="rounded-lg" disabled={saving} onClick={() => save(true)}>Finalize</Button>
          </div>
        </div>

        <div className="space-y-4">
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
              {splitMode && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Mixed makes detected — this dropdown switches both the on-screen preview and the downloaded PDF. Switch to GMS to download the GMS PDF, or MR for the MR PDF.
                </p>
              )}
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
          <CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle>Line Items</CardTitle>
            <div className="flex items-center gap-2">
              {(hasMR || hasGMS) && (
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={lineItemsView}
                  onValueChange={(v) => v && setLineItemsView(v as "MR" | "GMS" | "ALL")}
                  className="border rounded-md"
                >
                  <ToggleGroupItem value="MR" aria-label="Show MR items" disabled={!hasMR}>MR</ToggleGroupItem>
                  <ToggleGroupItem value="GMS" aria-label="Show GMS items" disabled={!hasGMS}>GMS</ToggleGroupItem>
                  <ToggleGroupItem value="ALL" aria-label="Show all items">All</ToggleGroupItem>
                </ToggleGroup>
              )}
              <Button size="sm" variant="outline" onClick={() => setItems([...items, { ...newItem(), make: lineItemsView === "ALL" ? format : lineItemsView }])}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardHeader>
          <CardContent>
            {splitMode && (
              <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <div className="font-medium">This cost sheet has both MR and GMS items.</div>
                <div className="text-muted-foreground">Use the <span className="font-semibold">MR / GMS / All</span> toggle to filter the table below. The OA preview &amp; PDF still follow the Format dropdown above (currently <span className="font-semibold">{format}</span>) — download will produce only the selected format’s PDF.</div>
              </div>
            )}
            <div className="space-y-2">
              <div className="grid grid-cols-14 gap-2 text-xs font-medium text-muted-foreground px-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
                <div className="col-span-4">Description</div>
                <div className="col-span-2">HSN</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">Unit</div>
                <div className="col-span-2">Rate</div>
                <div className="col-span-1">Make</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-1" />
              </div>
              {editorItems.map((it) => (
                <div key={it.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
                  <Input className="col-span-4" value={it.description} onChange={(e) => updateItemById(it.id, { description: e.target.value })} placeholder="Item description" />
                  <Input className="col-span-2" value={it.hsn_code} onChange={(e) => updateItemById(it.id, { hsn_code: e.target.value })} placeholder="HSN" />
                  <Input className="col-span-1" type="number" step="any" value={it.quantity} onChange={(e) => updateItemById(it.id, { quantity: +e.target.value })} />
                  <Input className="col-span-1" value={it.unit || "Nos"} onChange={(e) => updateItemById(it.id, { unit: e.target.value })} placeholder="Nos" />
                  <Input className="col-span-2" type="number" step="any" value={it.unit_rate} onChange={(e) => updateItemById(it.id, { unit_rate: +e.target.value })} />
                  <Select value={it.make || "MR"} onValueChange={(v) => updateItemById(it.id, { make: v as "MR" | "GMS" | "OTHER" })}>
                    <SelectTrigger className="col-span-1 h-9 px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MR">MR</SelectItem>
                      <SelectItem value="GMS">GMS</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="col-span-2 text-right font-medium">{it.amount.toFixed(2)}</div>
                  <Button size="icon" variant="ghost" className="col-span-1" onClick={() => removeItemById(it.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {editorItems.length === 0 && (
                <div className="text-sm text-muted-foreground italic px-1 py-4">No {lineItemsView === "ALL" ? "" : lineItemsView + " "}items. {lineItemsView !== "ALL" ? "Switch view or add one." : "Add one to get started."}</div>
              )}
              {splitMode && lineItemsView !== "ALL" && (
                <div className="pt-2 text-xs text-muted-foreground">
                  Hidden from this view: {allItemsWithAmounts.length - editorItems.length} item(s) with make ≠ {lineItemsView}.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Charges & Totals</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              {format === "MR" && (
                <>
                  <NumberField label="P&F %" value={charges.pf_percent} onChange={(v) => setCharges({ ...charges, pf_percent: v, pf_amount: 0 })} />
                  <NumberField label="P&F Amount (override)" value={charges.pf_amount} onChange={(v) => setCharges({ ...charges, pf_amount: v, pf_percent: 0 })} />
                  <NumberField label="Insurance %" value={charges.insurance_percent} onChange={(v) => setCharges({ ...charges, insurance_percent: v, insurance: 0 })} />
                  <NumberField label="Insurance Amount (override)" value={charges.insurance} onChange={(v) => setCharges({ ...charges, insurance: v, insurance_percent: 0 })} />
                  <div className="flex items-center gap-3">
                    <Switch checked={charges.freight_enabled} onCheckedChange={(b) => setCharges({ ...charges, freight_enabled: b })} />
                    <Label>Include Freight</Label>
                  </div>
                  {charges.freight_enabled && <NumberField label="Freight" value={charges.freight} onChange={(v) => setCharges({ ...charges, freight: v })} />}
                  <NumberField label="GST %" value={charges.gst_percent} onChange={(v) => setCharges({ ...charges, gst_percent: v, gst_amount: 0 })} />
                  <NumberField label="Discount %" value={charges.discount_percent} onChange={(v) => setCharges({ ...charges, discount_percent: v, discount: 0 })} />
                  <NumberField label="Discount Amount (one-time)" value={charges.discount} onChange={(v) => setCharges({ ...charges, discount: v, discount_percent: 0 })} />
                </>
              )}
              {format === "GMS" && (
                <div className="pt-2 border-t">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">GMS Pricing Mode</Label>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    EXW Turkey: base + Sea Freight, Custom, Local Freight, Insurance, GST as extras.
                    EXW Murthal: full landed-cost breakdown (uses the section below).
                  </p>
                  <Select
                    value={charges.gms_mode || "NONE"}
                    onValueChange={(v) => {
                      const mode = v === "NONE" ? undefined : (v as "EXW_TURKEY" | "EXW_MURTHAL");
                      setCharges({
                        ...charges,
                        gms_mode: mode,
                        ex_murthal_enabled: mode === "EXW_MURTHAL" ? true : (mode === "EXW_TURKEY" ? false : charges.ex_murthal_enabled),
                        // sensible defaults on first enable of EXW Turkey
                        turkey_custom_percent: charges.turkey_custom_percent ?? 10,
                        turkey_gst_percent: charges.turkey_gst_percent ?? 18,
                        turkey_local_freight_mode: charges.turkey_local_freight_mode ?? "amount",
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Legacy (current behavior)</SelectItem>
                      <SelectItem value="EXW_TURKEY">EXW Turkey (charges as extras)</SelectItem>
                      <SelectItem value="EXW_MURTHAL">EXW Murthal (full landed cost)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {format === "GMS" && charges.gms_mode === "EXW_TURKEY" && (
                <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/20">
                  <div className="text-xs font-semibold uppercase tracking-wide">EXW Turkey Charges</div>
                  <ModeToggleRow
                    label="Sea Freight"
                    enabled={!!charges.turkey_sea_freight_enabled}
                    mode={charges.turkey_sea_freight_mode || "amount"}
                    amount={charges.turkey_sea_freight || 0}
                    percent={charges.turkey_sea_freight_percent || 0}
                    base={charges.turkey_sea_freight_base || "basic"}
                    onToggle={(b) => setCharges({ ...charges, turkey_sea_freight_enabled: b })}
                    onMode={(m) => setCharges({ ...charges, turkey_sea_freight_mode: m })}
                    onAmount={(v) => setCharges({ ...charges, turkey_sea_freight: v })}
                    onPercent={(v) => setCharges({ ...charges, turkey_sea_freight_percent: v })}
                    onBase={(b) => setCharges({ ...charges, turkey_sea_freight_base: b })}
                  />
                  <ModeToggleRow
                    label="Insurance"
                    enabled={!!charges.turkey_insurance_enabled}
                    mode={charges.turkey_insurance_mode || "amount"}
                    amount={charges.turkey_insurance || 0}
                    percent={charges.turkey_insurance_percent || 0}
                    base={charges.turkey_insurance_base || "basic"}
                    onToggle={(b) => setCharges({ ...charges, turkey_insurance_enabled: b })}
                    onMode={(m) => setCharges({ ...charges, turkey_insurance_mode: m })}
                    onAmount={(v) => setCharges({ ...charges, turkey_insurance: v })}
                    onPercent={(v) => setCharges({ ...charges, turkey_insurance_percent: v })}
                    onBase={(b) => setCharges({ ...charges, turkey_insurance_base: b })}
                  />
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch checked={!!charges.turkey_custom_enabled} onCheckedChange={(b) => setCharges({ ...charges, turkey_custom_enabled: b })} />
                    <Label className={`text-sm ${charges.turkey_custom_enabled ? "" : "text-muted-foreground line-through"}`}>Custom Duty (%)</Label>
                    <Select
                      value={charges.turkey_custom_base || "basic"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_custom_base: v as "basic" | "landed" })}
                      disabled={!charges.turkey_custom_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">on Basic + Sea</SelectItem>
                        <SelectItem value="landed">on Landed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_custom_enabled}
                      value={charges.turkey_custom_percent ?? 10}
                      onChange={(e) => setCharges({ ...charges, turkey_custom_percent: +e.target.value || 0 })}
                    />
                  </div>
                  <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                    <Switch checked={!!charges.turkey_local_freight_enabled} onCheckedChange={(b) => setCharges({ ...charges, turkey_local_freight_enabled: b })} />
                    <Label className={`text-sm ${charges.turkey_local_freight_enabled ? "" : "text-muted-foreground line-through"}`}>Local Freight</Label>
                    <Select
                      value={charges.turkey_local_freight_mode || "amount"}
                      onValueChange={(v) => setCharges({ ...charges, turkey_local_freight_mode: v as "amount" | "percent" })}
                      disabled={!charges.turkey_local_freight_enabled}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">Flat ₹</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" step="any" disabled={!charges.turkey_local_freight_enabled}
                      value={(charges.turkey_local_freight_mode || "amount") === "percent" ? (charges.turkey_local_freight_percent || 0) : (charges.turkey_local_freight || 0)}
                      onChange={(e) => {
                        const v = +e.target.value || 0;
                        if ((charges.turkey_local_freight_mode || "amount") === "percent") {
                          setCharges({ ...charges, turkey_local_freight_percent: v });
                        } else {
                          setCharges({ ...charges, turkey_local_freight: v });
                        }
                      }}
                    />
                  </div>
                  {(charges.turkey_local_freight_mode || "amount") === "percent" && charges.turkey_local_freight_enabled && (
                    <div className="grid grid-cols-[auto_1fr_120px_140px] items-center gap-3">
                      <div />
                      <Label className="text-xs text-muted-foreground">Local Freight % base</Label>
                      <Select
                        value={charges.turkey_local_freight_base || "basic"}
                        onValueChange={(v) => setCharges({ ...charges, turkey_local_freight_base: v as "basic" | "landed" })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">on Basic</SelectItem>
                          <SelectItem value="landed">on Landed</SelectItem>
                        </SelectContent>
                      </Select>
                      <div />
                    </div>
                  )}
                  <ToggleNumberRow
                    label="GST % (on Basic + Sea + Ins + Custom + Local Freight)" enabled={!!charges.turkey_gst_enabled} value={charges.turkey_gst_percent ?? 18}
                    onToggle={(b) => setCharges({ ...charges, turkey_gst_enabled: b })}
                    onValue={(v) => setCharges({ ...charges, turkey_gst_percent: v })}
                  />
                  <ToggleNumberRow
                    label="One-time Discount (₹) — after GST" enabled={!!charges.turkey_discount_enabled} value={charges.turkey_discount || 0}
                    onToggle={(b) => setCharges({ ...charges, turkey_discount_enabled: b })}
                    onValue={(v) => setCharges({ ...charges, turkey_discount: v })}
                  />
                </div>
              )}
              <div className="pt-2 border-t">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Foreign Currency (Ex-works)</Label>
                <p className="text-[11px] text-muted-foreground mb-2">For GMS imports (e.g. Ex-works Turkey in USD). Leave currency blank or "INR" for domestic orders.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Currency</Label>
                    <Select
                      value={charges.currency || "INR"}
                      onValueChange={(v) => setCharges({ ...charges, currency: v === "INR" ? undefined : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INR">INR (domestic)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <NumberField label="FX Rate (₹)" value={charges.fx_rate || 0} onChange={(v) => setCharges({ ...charges, fx_rate: v })} />
                  <NumberField label="Advance %" value={charges.advance_percent ?? 40} onChange={(v) => setCharges({ ...charges, advance_percent: v })} />
                </div>
              </div>
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ex-works Murthal (Landed Cost)</Label>
                    <p className="text-[11px] text-muted-foreground">GMS imports landing at Murthal — base, hike, freight, sea freight, customs, clearing & GST. Toggle each line.</p>
                  </div>
                  <Switch
                    checked={!!charges.ex_murthal_enabled}
                    onCheckedChange={(b) => setCharges({ ...charges, ex_murthal_enabled: b,
                      // sensible defaults on first enable
                      custom_percent: charges.custom_percent ?? 8.25,
                      clearing_percent: charges.clearing_percent ?? 1.5,
                      landed_gst_percent: charges.landed_gst_percent ?? 18,
                    })}
                  />
                </div>
                {charges.ex_murthal_enabled && (
                  <div className="mt-3 space-y-2 rounded-md border p-3 bg-muted/20">
                    <ToggleNumberRow
                      label="Sea Freight % (of Basic)" enabled={!!charges.sea_freight_enabled} value={charges.sea_freight || 0}
                      onToggle={(b) => setCharges({ ...charges, sea_freight_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, sea_freight: v })}
                    />
                    <ToggleNumberRow
                      label="Insurance % (of Basic)" enabled={!!charges.sea_insurance_enabled} value={charges.sea_insurance || 0}
                      onToggle={(b) => setCharges({ ...charges, sea_insurance_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, sea_insurance: v })}
                    />
                    <ToggleNumberRow
                      label="Custom Duty %" enabled={!!charges.custom_enabled} value={charges.custom_percent ?? 8.25}
                      onToggle={(b) => setCharges({ ...charges, custom_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, custom_percent: v })}
                    />
                    <ToggleNumberRow
                      label="Clearing (CHA & Port) %" enabled={!!charges.clearing_enabled} value={charges.clearing_percent ?? 1.5}
                      onToggle={(b) => setCharges({ ...charges, clearing_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, clearing_percent: v })}
                    />
                    <ToggleNumberRow
                      label="GST %" enabled={!!charges.landed_gst_enabled} value={charges.landed_gst_percent ?? 18}
                      onToggle={(b) => setCharges({ ...charges, landed_gst_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, landed_gst_percent: v })}
                    />
                    <ToggleNumberRow
                      label="One-time Discount % (of Grand Total)" enabled={!!charges.landed_discount_enabled} value={charges.landed_discount || 0}
                      onToggle={(b) => setCharges({ ...charges, landed_discount_enabled: b })}
                      onValue={(v) => setCharges({ ...charges, landed_discount: v })}
                    />
                    <p className="text-[10px] text-muted-foreground italic pt-1">All values are percentages — calculated amount appears in the preview &amp; PDF (no % shown there). Freight % uses the value set above.</p>
                  </div>
                )}
              </div>
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

        {format === "MR" && (
          <>
            <Card>
              <CardHeader><CardTitle>Terms &amp; Conditions</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={8} className="font-mono text-xs" />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setTerms(DEFAULT_MR_TERMS)}>Reset to default</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Bank Details</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3">
                <div><Label>Bank Name</Label><Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} /></div>
                <div><Label>Branch</Label><Input value={bank.branch} onChange={(e) => setBank({ ...bank, branch: e.target.value })} /></div>
                <div><Label>Account Number</Label><Input value={bank.account_no} onChange={(e) => setBank({ ...bank, account_no: e.target.value })} /></div>
                <div><Label>IFSC Code</Label><Input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value })} /></div>
                <div className="md:col-span-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setBank(DEFAULT_MR_BANK)}>Reset to default</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {format === "GMS" && (
          <Card>
            <CardHeader><CardTitle>GMS Terms &amp; Conditions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs uppercase tracking-wide font-semibold underline">Commercial Condition</div>
              <div><Label>Taxation</Label><Input value={gmsTerms.taxation} onChange={(e) => setGmsTerms({ ...gmsTerms, taxation: e.target.value })} /></div>
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Freight</Label><Input value={gmsTerms.freight} onChange={(e) => setGmsTerms({ ...gmsTerms, freight: e.target.value })} /></div>
                <div><Label>Insurance</Label><Input value={gmsTerms.insurance} onChange={(e) => setGmsTerms({ ...gmsTerms, insurance: e.target.value })} /></div>
              </div>
              <div><Label>Delivery Time</Label><Textarea rows={2} value={gmsTerms.delivery_time} onChange={(e) => setGmsTerms({ ...gmsTerms, delivery_time: e.target.value })} /></div>
              <div><Label>Payment Terms</Label><Textarea rows={2} value={gmsTerms.payment_terms} onChange={(e) => setGmsTerms({ ...gmsTerms, payment_terms: e.target.value })} /></div>
              <div><Label>General Conditions</Label><Textarea rows={2} value={gmsTerms.general_conditions} onChange={(e) => setGmsTerms({ ...gmsTerms, general_conditions: e.target.value })} /></div>
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setGmsTerms(DEFAULT_GMS_TERMS)}>Reset to default</Button>
              </div>
            </CardContent>
          </Card>
        )}
          </div>

          <section id="preview" className="space-y-3 pt-6 border-t">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Review &amp; Export</h2>
              <p className="text-sm text-muted-foreground">
                Scroll through the preview below. When everything looks correct, export the PDF.
              </p>
            </div>
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
              splitMode={splitMode}
              onFormatChange={(f) => { setAutoFormat(false); setFormat(f); }}
              onDownloadPDF={downloadPDF}
              terms={terms}
              bank={bank}
              gmsTerms={gmsTerms}
            />
            {(!companyName.trim() || !itemsWithAmounts.some((i) => i.description.trim())) && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Add at least one item description and a customer name before exporting.
              </p>
            )}
            <div className="flex justify-end pt-2">
              <Button size="lg" onClick={downloadPDF} className="w-full sm:w-auto">
                <Download className="mr-2 h-4 w-4" />
                {splitMode ? `Export ${format} PDF` : "Export PDF"}
              </Button>
            </div>
          </section>
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
function ToggleNumberRow({
  label, enabled, value, onToggle, onValue,
}: { label: string; enabled: boolean; value: number; onToggle: (b: boolean) => void; onValue: (v: number) => void; }) {
  return (
    <div className="grid grid-cols-[auto_1fr_140px] items-center gap-3">
      <Switch checked={enabled} onCheckedChange={onToggle} />
      <Label className={`text-sm ${enabled ? "" : "text-muted-foreground line-through"}`}>{label}</Label>
      <Input type="number" step="any" disabled={!enabled} value={value} onChange={(e) => onValue(+e.target.value || 0)} />
    </div>
  );
}
function ModeToggleRow({
  label, enabled, mode, amount, percent, base, onToggle, onMode, onAmount, onPercent, onBase,
}: {
  label: string; enabled: boolean; mode: "amount" | "percent";
  amount: number; percent: number;
  base?: "basic" | "landed";
  onToggle: (b: boolean) => void;
  onMode: (m: "amount" | "percent") => void;
  onAmount: (v: number) => void;
  onPercent: (v: number) => void;
  onBase?: (b: "basic" | "landed") => void;
}) {
  const isPercent = mode === "percent";
  return (
    <div className="grid grid-cols-[auto_1fr_120px_120px_140px] items-center gap-3">
      <Switch checked={enabled} onCheckedChange={onToggle} />
      <Label className={`text-sm ${enabled ? "" : "text-muted-foreground line-through"}`}>
        {label} {isPercent ? "(%)" : "(₹)"}
      </Label>
      <Select value={mode} onValueChange={(v) => onMode(v as "amount" | "percent")} disabled={!enabled}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="amount">Flat ₹</SelectItem>
          <SelectItem value="percent">%</SelectItem>
        </SelectContent>
      </Select>
      {isPercent && onBase ? (
        <Select value={base || "basic"} onValueChange={(v) => onBase(v as "basic" | "landed")} disabled={!enabled}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">on Basic</SelectItem>
            <SelectItem value="landed">on Landed</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div />
      )}
      <Input
        type="number" step="any" disabled={!enabled}
        value={isPercent ? percent : amount}
        onChange={(e) => {
          const v = +e.target.value || 0;
          if (isPercent) onPercent(v); else onAmount(v);
        }}
      />
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-bold text-base" : "text-sm"}`}><span>{k}</span><span>₹ {v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>;
}

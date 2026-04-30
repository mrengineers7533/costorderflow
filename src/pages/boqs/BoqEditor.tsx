import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2, Download, Printer, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { DEFAULT_BOQ_TERMS, deriveBoqNumber } from "@/lib/boq/types";
import { generateBoqPDF } from "@/lib/boq/pdf";
import type { OrderRecord } from "@/lib/orders/types";

function newBoqItem(seq: number): BoqLineItem {
  return { id: crypto.randomUUID(), item_no: String(seq), model_number: "", description: "", quantity: 1, unit: "Nos", remarks: "" };
}

export default function BoqEditor() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const orderIdFromQuery = params.get("orderId");
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [boqId, setBoqId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>("");
  const [boqNumber, setBoqNumber] = useState("");
  const [version, setVersion] = useState(1);
  const [format, setFormat] = useState<"MR" | "GMS">("MR");
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [preparedBy, setPreparedBy] = useState("");
  const [boqDate, setBoqDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceOa, setReferenceOa] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [items, setItems] = useState<BoqLineItem[]>([newBoqItem(1)]);
  const [terms, setTerms] = useState(DEFAULT_BOQ_TERMS);
  const [notes, setNotes] = useState("");

  // Load existing BOQ or initialize from order
  useEffect(() => {
    (async () => {
      if (!isNew) {
        const { data, error } = await supabase.from("boqs").select("*").eq("id", id!).maybeSingle();
        if (error || !data) {
          toast({ title: "BOQ not found", variant: "destructive" });
          navigate("/boqs");
          return;
        }
        const b = data as unknown as BoqRecord;
        setBoqId(b.id); setOrderId(b.order_id); setBoqNumber(b.boq_number); setVersion(b.version);
        setFormat(b.format); setStatus(b.status); setPreparedBy(b.prepared_by || "");
        setBoqDate(b.boq_date); setReferenceOa(b.reference_oa_number || "");
        setProjectNumber(b.project_number || ""); setClientName(b.client_name || "");
        setItems(b.line_items?.length ? b.line_items : [newBoqItem(1)]);
        setTerms(b.terms || DEFAULT_BOQ_TERMS); setNotes(b.notes || "");
        setLoading(false);
        return;
      }
      // New BOQ — pre-fill from parent order
      if (!orderIdFromQuery) {
        toast({ title: "Missing order", description: "BOQ must be created from an order.", variant: "destructive" });
        navigate("/orders");
        return;
      }
      const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderIdFromQuery).maybeSingle();
      if (error || !order) {
        toast({ title: "Order not found", variant: "destructive" });
        navigate("/orders");
        return;
      }
      const o = order as unknown as OrderRecord;
      setOrderId(o.id);
      setFormat(o.format);
      setReferenceOa(o.oa_number);
      setBoqNumber(deriveBoqNumber(o.oa_number));
      setPreparedBy(o.prepared_by || "");
      setProjectNumber(o.cost_sheet_number || o.reference || "");
      setClientName(o.company_name || o.bill_to?.name || "");
      // How many BOQs already exist for this order? -> version = count + 1
      const { data: existing } = await supabase.from("boqs").select("id").eq("order_id", o.id);
      const v = (existing?.length || 0) + 1;
      setVersion(v);
      // Map order line items -> BOQ items (no pricing)
      const mapped: BoqLineItem[] = (o.line_items || []).map((it, i) => ({
        id: crypto.randomUUID(),
        item_no: String(i + 1),
        model_number: it.hsn_code || "",
        description: it.description || "",
        quantity: Number(it.quantity) || 0,
        unit: it.unit || "Nos",
        remarks: "",
      }));
      setItems(mapped.length ? mapped : [newBoqItem(1)]);
      setTerms(DEFAULT_BOQ_TERMS);
      setNotes(o.notes || "");
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, orderIdFromQuery]);

  function buildRecord(): BoqRecord {
    return {
      id: boqId || "preview", order_id: orderId, user_id: null,
      boq_number: boqNumber, version, format, status,
      prepared_by: preparedBy || null, boq_date: boqDate,
      reference_oa_number: referenceOa || null, project_number: projectNumber || null,
      client_name: clientName || null, line_items: items, terms, notes,
      created_at: "", updated_at: "",
    };
  }

  async function save(finalize: boolean) {
    setSaving(true);
    const payload = {
      order_id: orderId,
      boq_number: boqNumber || deriveBoqNumber(referenceOa),
      version, format,
      status: finalize ? "finalized" as const : "draft" as const,
      prepared_by: preparedBy || null, boq_date: boqDate,
      reference_oa_number: referenceOa || null, project_number: projectNumber || null,
      client_name: clientName || null, line_items: items, terms, notes,
    };
    const res = isNew
      ? await supabase.from("boqs").insert(payload as never).select().single()
      : await supabase.from("boqs").update(payload as never).eq("id", boqId!).select().single();
    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    setStatus(payload.status);
    toast({ title: "Saved", description: `BOQ ${payload.boq_number}` });
    if (isNew) navigate(`/boqs/${res.data.id}`, { replace: true });
  }

  async function downloadPDF() {
    const doc = await generateBoqPDF(buildRecord());
    const safe = (boqNumber || "BOQ").replace(/[/\\]/g, "_");
    doc.save(`${safe}.pdf`);
    toast({ title: "BOQ PDF downloaded" });
  }

  async function uploadToBoqFolder() {
    const doc = await generateBoqPDF(buildRecord());
    const blob = doc.output("blob");
    const safe = (boqNumber || "BOQ").replace(/[/\\]/g, "_");
    const path = `${orderId}/${safe}-v${version}.pdf`;
    const { error } = await supabase.storage.from("boq-documents").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    if (error) return toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved to BOQ folder", description: path });
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  return (
    <div className="min-h-screen p-6 lg:p-8 print:p-0">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-4 shadow-sm print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate(orderId ? `/orders/${orderId}` : "/boqs")} className="rounded-lg">
              <ArrowLeft className="mr-1 h-4 w-4" />Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Bill of Quantities</div>
              <div className="flex items-center gap-2">
                <div className="font-mono font-semibold truncate">{boqNumber || "New BOQ"}</div>
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">{format}</span>
                {version > 1 && <span className="text-[11px] text-muted-foreground">v{version}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
            <Button variant="outline" size="sm" onClick={downloadPDF}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
            <Button variant="outline" size="sm" onClick={uploadToBoqFolder}>Save to BOQ Folder</Button>
            <Button variant="secondary" size="sm" disabled={saving} onClick={() => save(false)}><Save className="mr-1 h-4 w-4" />Save Draft</Button>
            <Button size="sm" disabled={saving} onClick={() => save(true)}>Finalize</Button>
          </div>
        </div>

        <div className="space-y-5">
          {/* ---------- Editor ---------- */}
          <div className="space-y-4 print:hidden">
            <Card>
              <CardHeader><CardTitle>Header</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3">
                <div><Label>BOQ Number</Label><Input value={boqNumber} onChange={(e) => setBoqNumber(e.target.value)} /></div>
                <div><Label>Date</Label><Input type="date" value={boqDate} onChange={(e) => setBoqDate(e.target.value)} /></div>
                <div><Label>Reference OA Number</Label><Input value={referenceOa} onChange={(e) => setReferenceOa(e.target.value)} /></div>
                <div><Label>Project / Cost Sheet No.</Label><Input value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} /></div>
                <div><Label>Prepared By</Label><Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Items</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, newBoqItem(p.length + 1)])}>
                  <Plus className="mr-1 h-4 w-4" />Add Row
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_36px] gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <div>Item</div><div>Model</div><div>Description</div><div>Qty</div><div>Unit</div><div>Remarks</div><div></div>
                </div>
                {items.map((it) => (
                  <div key={it.id} className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_36px] gap-1.5 items-start">
                    <Input value={it.item_no} onChange={(e) => updateItem(it.id, { item_no: e.target.value })} className="h-9" />
                    <Input value={it.model_number} onChange={(e) => updateItem(it.id, { model_number: e.target.value })} className="h-9" />
                    <Textarea value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} className="min-h-9" rows={1} />
                    <Input type="number" value={it.quantity} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} className="h-9" />
                    <Input value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value })} className="h-9" />
                    <Textarea value={it.remarks} onChange={(e) => updateItem(it.id, { remarks: e.target.value })} className="min-h-9" rows={1} />
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(it.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Terms & Conditions</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={8} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </CardContent>
            </Card>
          </div>

          {/* ---------- Live document preview (below editor) ---------- */}
          <div id="boq-preview">
            <BoqDocPreview rec={buildRecord()} />
          </div>
        </div>
      </div>
    </div>
  );

  function updateItem(idv: string, patch: Partial<BoqLineItem>) {
    setItems((p) => p.map((it) => it.id === idv ? { ...it, ...patch } : it));
  }
  function removeItem(idv: string) {
    setItems((p) => {
      const next = p.filter((it) => it.id !== idv);
      return next.length ? next : [newBoqItem(1)];
    });
  }
}

/* -------- BOQ document-style preview (mirrors PDF visual) -------- */
function BoqDocPreview({ rec }: { rec: BoqRecord }) {
  const isMR = rec.format === "MR";
  return (
    <Card className="overflow-hidden bg-background">
      <div className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b print:hidden">
        Live BOQ Preview
      </div>
      <div className="p-5 text-[12px] leading-snug space-y-3">
        {/* Header */}
        {isMR ? (
          <div className="border-b-2 border-orange-600 pb-2 flex items-start justify-between">
            <div className="font-bold text-lg">M.R. Engineers</div>
            <div className="text-right text-[10px]">
              <div className="font-bold">*  ENGINEERS    *  CONTRACTORS    *  SUPPLIERS</div>
              <div>Shed No. 33, HSIIDC, Murthal, Sonepat.</div>
              <div className="font-bold">GSTIN-06AARPM1849G1ZF</div>
            </div>
          </div>
        ) : (
          <div className="border-b pb-2 flex items-start justify-between">
            <div>
              <div className="font-bold">GRAIN MILLING SOLUTIONS</div>
              <div className="text-[10px]">PRIVATE LIMITED</div>
            </div>
            <div className="text-right">
              <div className="font-bold">UGUR MACHINE, TURKEY</div>
              <div className="italic text-[10px]">Quality Standard is an Assurance of UGUR at all parts</div>
            </div>
          </div>
        )}

        <div className="bg-muted text-center font-bold py-1 text-base tracking-wider">BOQ</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
          <div><span className="font-bold">BOQ No.:</span> {rec.boq_number}{rec.version > 1 ? `  (v${rec.version})` : ""}</div>
          <div><span className="font-bold">Date:</span> {new Date(rec.boq_date).toLocaleDateString("en-GB").replace(/\//g, "-")}</div>
          <div><span className="font-bold">Order Acceptance No.:</span> {rec.reference_oa_number || "-"}</div>
          <div><span className="font-bold">Prepared By:</span> {rec.prepared_by || "-"}</div>
          <div><span className="font-bold">Project / Cost Sheet No.:</span> {rec.project_number || "-"}</div>
        </div>

        <table className="w-full border-collapse text-[11px] border border-foreground">
          <thead>
            <tr className={isMR ? "" : ""} style={{ backgroundColor: isMR ? "rgb(234,88,12)" : "rgb(200,200,200)", color: isMR ? "white" : "black" }}>
              <th className="border border-foreground px-1.5 py-1 w-12 text-center">ITEM No.</th>
              <th className="border border-foreground px-1.5 py-1 w-24 text-left">MODEL NUMBER</th>
              <th className="border border-foreground px-1.5 py-1 text-left">DESCRIPTION</th>
              <th className="border border-foreground px-1.5 py-1 w-12 text-center">QTY</th>
              <th className="border border-foreground px-1.5 py-1 w-12 text-center">UNIT</th>
              <th className="border border-foreground px-1.5 py-1 w-32 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rec.line_items.length === 0 ? (
              <tr><td colSpan={6} className="border border-foreground px-2 py-3 text-center italic text-muted-foreground">No items</td></tr>
            ) : rec.line_items.map((it, i) => (
              <tr key={it.id} className="align-top">
                <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.item_no || i + 1}</td>
                <td className="border border-foreground px-1.5 py-1">{it.model_number}</td>
                <td className="border border-foreground px-1.5 py-1 whitespace-pre-wrap">{it.description}</td>
                <td className="border border-foreground px-1.5 py-1 text-center tabular-nums">{it.quantity || ""}</td>
                <td className="border border-foreground px-1.5 py-1 text-center">{it.unit}</td>
                <td className="border border-foreground px-1.5 py-1 whitespace-pre-wrap">{it.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rec.terms?.trim() && (
          <div className="border border-foreground p-2 text-[11px] whitespace-pre-wrap">
            <div className="font-bold mb-0.5">TERMS & CONDITIONS:</div>
            {rec.terms}
          </div>
        )}
        {rec.notes?.trim() && (
          <div className="text-[11px]"><span className="font-bold">Notes:</span> {rec.notes}</div>
        )}
      </div>
    </Card>
  );
}
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Printer, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { DEFAULT_BOQ_TERMS, deriveBoqNumber } from "@/lib/boq/types";
import { generateBoqPDF } from "@/lib/boq/pdf";
import type { OrderRecord } from "@/lib/orders/types";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";

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
  const [verificationStatus, setVerificationStatus] = useState<"approved" | "pending_verification">("approved");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  // Description is the ONLY editable field, and only after senior approval.
  const isLocked = verificationStatus === "pending_verification";
  const canEditDescription = !isLocked;

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
        setVerificationStatus(b.verification_status || "approved");
        setVerificationToken(b.verification_token || null);
        // OA-driven model: refresh items from latest OA. Preserve any
        // user-edited Description/Remarks matched by model number.
        let nextItems: BoqLineItem[] = b.line_items?.length ? b.line_items : [newBoqItem(1)];
        if (b.order_id) {
          const { data: oa } = await supabase.from("orders").select("*").eq("id", b.order_id).maybeSingle();
          if (oa) {
            const o = oa as unknown as OrderRecord;
            const prevByModel = new Map<string, BoqLineItem>();
            (b.line_items || []).forEach((it) => {
              const k = (it.model_number || "").trim().toLowerCase();
              if (k) prevByModel.set(k, it);
            });
            nextItems = (o.line_items || []).map((it, i) => {
              const model = it.hsn_code || "";
              const prev = prevByModel.get(model.trim().toLowerCase());
              return {
                id: prev?.id || crypto.randomUUID(),
                item_no: String(i + 1),
                model_number: model,
                description: prev?.description || it.description || "",
                quantity: Number(it.quantity) || 0,
                unit: it.unit || "Nos",
                remarks: prev?.remarks || "",
              };
            });
            setReferenceOa(o.oa_number);
            setProjectNumber(o.cost_sheet_number || o.reference || b.project_number || "");
            setClientName(o.company_name || o.bill_to?.name || b.client_name || "");
            setFormat(o.format);
            // BOQ number always mirrors the latest OA revision.
            setBoqNumber(deriveBoqNumber(o.oa_number));
          }
        }
        setItems(nextItems.length ? nextItems : [newBoqItem(1)]);
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
            <Button variant="outline" size="sm" onClick={uploadToBoqFolder}>Save to BOQ Folder</Button>
            {canEditDescription && (
              <Button size="sm" disabled={saving} onClick={() => save(true)}>
                <Save className="mr-1 h-4 w-4" />Save Description
              </Button>
            )}
          </div>
        </div>

        {verificationStatus === "pending_verification" && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm print:hidden">
            <div className="font-medium text-amber-700 dark:text-amber-400">Pending Senior Approval — BOQ Locked</div>
            <p className="mt-1 text-xs text-muted-foreground">
              This BOQ revision was auto-generated from the latest OA. All fields are locked.
              After senior approval via the verification link, only the Description column will become editable.
            </p>
            {verificationToken && (
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/boq-verify/${verificationToken}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: "Verification link copied" });
                  }}
                >
                  Copy verification link
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-5">
          {/* ---------- Editor ---------- */}
          <div className="space-y-4 print:hidden">
            <Card>
              <CardHeader><CardTitle>Header</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-3">
                <div><Label>BOQ Number</Label><Input value={boqNumber} readOnly /></div>
                <div><Label>Date</Label><Input type="date" value={boqDate} readOnly /></div>
                <div><Label>Reference OA Number</Label><Input value={referenceOa} readOnly /></div>
                <div><Label>Project / Cost Sheet No.</Label><Input value={projectNumber} readOnly /></div>
                <div><Label>Prepared By</Label><Input value={preparedBy} readOnly /></div>
                <p className="md:col-span-2 text-xs text-muted-foreground">
                  Header & items always mirror the linked OA.
                  {isLocked
                    ? " BOQ is locked pending senior approval."
                    : " After approval, only the Description column is editable."}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Synced from OA.
                  {isLocked
                    ? " Locked pending senior approval."
                    : " Only Description is editable."}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)] gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <div>Item</div><div>Model</div><div>Description</div><div>Qty</div><div>Unit</div><div>Remarks</div>
                </div>
                {items.map((it) => (
                  <div key={it.id} className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)] gap-1.5 items-start">
                    <Input value={it.item_no} readOnly className="h-9" />
                    <Input value={it.model_number} readOnly className="h-9" />
                    <Textarea
                      value={it.description}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                      readOnly={!canEditDescription}
                      className="min-h-9"
                      rows={1}
                    />
                    <Input type="number" value={it.quantity} readOnly className="h-9" />
                    <Input value={it.unit} readOnly className="h-9" />
                    <Textarea value={it.remarks} readOnly className="min-h-9" rows={1} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Terms & Conditions</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={terms} readOnly rows={8} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea value={notes} readOnly rows={3} />
              </CardContent>
            </Card>
          </div>

          {/* ---------- Live document preview (below editor) ---------- */}
          <div id="boq-preview">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 print:hidden">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Live Preview</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
                <Button variant="outline" size="sm" onClick={downloadPDF}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
              </div>
            </div>
            <BoqDocPreview rec={buildRecord()} />
          </div>
        </div>
      </div>
    </div>
  );

  function updateItem(idv: string, patch: Partial<BoqLineItem>) {
    setItems((p) => p.map((it) => it.id === idv ? { ...it, ...patch } : it));
  }
  // Item rows can no longer be added/removed manually — they always
  // come from the linked OA. Helper kept for future use.
}

/* -------- BOQ document-style preview — mirrors generated PDF 1:1 --------
   Uses A4 proportions (210x297mm) so on-screen layout matches the exported PDF
   exactly: same header, accent rule, BOQ title bar, two-column meta block,
   table column widths, header colors, terms box, and notes line. */
function BoqDocPreview({ rec }: { rec: BoqRecord }) {
  const isMR = rec.format === "MR";
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB").replace(/\//g, "-");
  const accent = isMR ? "rgb(234,88,12)" : "rgb(120,120,120)";
  return (
    <Card className="overflow-hidden bg-muted/40 print:bg-white print:border-0 print:shadow-none">
      <div className="bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b print:hidden">
        Live BOQ Preview — exact PDF output
      </div>
      {/* A4 page: 210mm wide. Use mm units so it visually matches the PDF. */}
      <div className="mx-auto my-4 bg-white text-black shadow-md print:shadow-none print:my-0"
           style={{ width: "210mm", minHeight: "297mm", padding: "12mm", fontFamily: "Helvetica, Arial, sans-serif", fontSize: "9pt", lineHeight: 1.25 }}>
        {/* ===== Header ===== */}
        {isMR ? (
          <div style={{ position: "relative", paddingBottom: "6mm", marginBottom: "6mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <img src={mrLogoUrl} alt="MR" style={{ maxWidth: "60mm", maxHeight: "20mm", objectFit: "contain" }} />
              <div style={{ textAlign: "right", color: "#1e1e1e" }}>
                <div style={{ fontWeight: 700, fontSize: "13pt" }}>M.R. Engineers</div>
                <div style={{ fontWeight: 700, fontSize: "7pt", marginTop: "1mm" }}>*  ENGINEERS    *  CONTRACTORS    *  SUPPLIERS</div>
                <div style={{ fontSize: "7pt" }}>Shed No. 33, HSIIDC, Murthal, Sonepat.</div>
                <div style={{ fontWeight: 700, fontSize: "7pt" }}>GSTIN-06AARPM1849G1ZF</div>
              </div>
            </div>
            <div style={{ position: "absolute", left: "-12mm", right: "-12mm", bottom: 0, height: "0.6mm", background: accent }} />
          </div>
        ) : (
          <div style={{ marginBottom: "4mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <img src={gmsLogoUrl} alt="GMS" style={{ maxWidth: "50mm", maxHeight: "22mm", objectFit: "contain", display: "block" }} />
                <div style={{ fontWeight: 700, fontSize: "8pt", marginTop: "2mm" }}>GRAIN MILLING SOLUTIONS PRIVATE LIMITED</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <img src={ugurLogoUrl} alt="UGUR" style={{ maxWidth: "45mm", maxHeight: "22mm", objectFit: "contain", display: "block", marginLeft: "auto" }} />
                <div style={{ fontWeight: 700, fontSize: "9pt", marginTop: "2mm" }}>UGUR MACHINE, TURKEY</div>
                <div style={{ fontStyle: "italic", fontSize: "6.5pt" }}>Quality Standard is an Assurance of UGUR at all parts</div>
              </div>
            </div>
          </div>
        )}

        {/* ===== BOQ title bar ===== */}
        <div style={{ background: "rgb(200,200,200)", textAlign: "center", fontWeight: 700, fontSize: "12pt", padding: "1.5mm 0" }}>
          BOQ
        </div>

        {/* ===== Meta two-column ===== */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "10mm", rowGap: "1.2mm", marginTop: "4mm", fontSize: "8.5pt" }}>
          <div><b>BOQ No.:</b> {rec.boq_number}{rec.version > 1 ? `  (v${rec.version})` : ""}</div>
          <div><b>Date:</b> {fmtDate(rec.boq_date)}</div>
          <div><b>Order Acceptance No.:</b> {rec.reference_oa_number || "-"}</div>
          <div><b>Prepared By:</b> {rec.prepared_by || "-"}</div>
          <div></div>
          <div><b>Project / Cost Sheet No.:</b> {rec.project_number || "-"}</div>
        </div>

        {/* ===== Items table ===== */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "4mm", fontSize: "8.5pt", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "16mm" }} />
            <col style={{ width: "32mm" }} />
            <col />
            <col style={{ width: "14mm" }} />
            <col style={{ width: "14mm" }} />
            <col style={{ width: "50mm" }} />
          </colgroup>
          <thead>
            <tr style={{ background: isMR ? "rgb(234,88,12)" : "rgb(120,120,120)", color: "white" }}>
              {["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "QTY", "UNIT", "Remarks"].map((h, i) => (
                <th key={h} style={{ border: "0.2mm solid #000", padding: "1.5mm", fontWeight: 700, textAlign: i === 0 || i === 3 || i === 4 ? "center" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rec.line_items.length === 0 ? (
              <tr><td colSpan={6} style={{ border: "0.2mm solid #000", padding: "3mm", textAlign: "center", fontStyle: "italic", color: "#777" }}>(no items)</td></tr>
            ) : rec.line_items.map((it, i) => (
              <tr key={it.id} style={{ verticalAlign: "top" }}>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.item_no || i + 1}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm" }}>{it.model_number}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", whiteSpace: "pre-wrap" }}>{it.description}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.quantity || ""}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.unit}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", whiteSpace: "pre-wrap" }}>{it.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ===== Terms box ===== */}
        {rec.terms?.trim() && (
          <div style={{ marginTop: "4mm", border: "0.3mm solid #000", padding: "2mm", fontSize: "8pt", whiteSpace: "pre-wrap" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.5mm" }}>TERMS & CONDITIONS:</div>
            {rec.terms}
          </div>
        )}

        {/* ===== Notes inline ===== */}
        {rec.notes?.trim() && (
          <div style={{ marginTop: "3mm", fontSize: "8pt" }}>
            <b>Notes:</b> {rec.notes}
          </div>
        )}
      </div>
    </Card>
  );
}
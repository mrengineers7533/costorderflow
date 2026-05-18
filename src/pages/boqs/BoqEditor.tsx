import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Eye, FileText, History, Printer, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { DEFAULT_BOQ_TERMS, deriveBoqNumber, sortByItemNo } from "@/lib/boq/types";
import { generateBoqPDF } from "@/lib/boq/pdf";
import type { OrderRecord } from "@/lib/orders/types";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";
import { DesignReviewPanel } from "@/components/boqs/DesignReviewPanel";
import { DesignCommentRow, useLatestDesignReview } from "@/components/boqs/DesignCommentsInline";
import { RevisionsTable } from "@/components/boqs/RevisionsTable";
import { statusLabel } from "@/lib/boq/designReview";
import { fetchRemarksAuditLog, insertRemarksAuditLogs } from "@/lib/boq/auditLog";

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
  const [originalItems, setOriginalItems] = useState<BoqLineItem[]>([newBoqItem(1)]);
  const [terms, setTerms] = useState(DEFAULT_BOQ_TERMS);
  const [notes, setNotes] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<"approved" | "pending_verification" | "rejected">("approved");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [designReviewStatus, setDesignReviewStatus] = useState<string>("draft");
  const [refreshKey, setRefreshKey] = useState(0);
  // Track the OA owner and BOQ creator so either can edit Remarks.
  const [oaOwnerId, setOaOwnerId] = useState<string | null>(null);
  const [boqUserId, setBoqUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const isCreator = !!currentUserId && (currentUserId === oaOwnerId || currentUserId === boqUserId);
  // Remarks is the ONLY editable field, and only by the OA/BOQ creator.
  const canEditRemarks = isCreator;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

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
        setDesignReviewStatus((b as unknown as { design_review_status?: string }).design_review_status || "draft");
        setBoqUserId(b.user_id || null);
        // OA-driven model: refresh items from latest OA. Preserve any
        // user-edited Description/Remarks matched by model number.
        let nextItems: BoqLineItem[] = b.line_items?.length ? b.line_items : [newBoqItem(1)];
        if (b.order_id) {
          const { data: oa } = await supabase.from("orders").select("*").eq("id", b.order_id).maybeSingle();
          if (oa) {
            const o = oa as unknown as OrderRecord;
            setOaOwnerId(o.user_id || null);
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
                // BOQ description always comes from latest OA.
                description: it.description || "",
                quantity: Number(it.quantity) || 0,
                unit: it.unit || "Nos",
                remarks: prev?.remarks || "",
                approval_status: prev?.approval_status,
                approval_comment: prev?.approval_comment,
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
        const finalItems = sortByItemNo(nextItems.length ? nextItems : [newBoqItem(1)]);
        setItems(finalItems);
        setOriginalItems(JSON.parse(JSON.stringify(finalItems)));
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
      setOaOwnerId(o.user_id || null);
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
      const finalItems = mapped.length ? mapped : [newBoqItem(1)];
      setItems(finalItems);
      setOriginalItems(JSON.parse(JSON.stringify(finalItems)));
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
    const shouldFlipStatus = !isNew && (designReviewStatus === "review_received" || designReviewStatus === "changes_required");
    const payload = {
      order_id: orderId,
      boq_number: boqNumber || deriveBoqNumber(referenceOa),
      version, format,
      status: finalize ? "finalized" as const : "draft" as const,
      prepared_by: preparedBy || null, boq_date: boqDate,
      reference_oa_number: referenceOa || null, project_number: projectNumber || null,
      client_name: clientName || null, line_items: items, terms, notes,
      ...(shouldFlipStatus ? { design_review_status: "boq_updated" } : {}),
    };
    const res = isNew
      ? await supabase.from("boqs").insert(payload as never).select().single()
      : await supabase.from("boqs").update(payload as never).eq("id", boqId!).select().single();
    setSaving(false);
    if (res.error) return toast({ title: "Save failed", description: res.error.message, variant: "destructive" });
    setStatus(payload.status);
    if (shouldFlipStatus) setDesignReviewStatus("boq_updated");
    toast({ title: "Saved", description: `BOQ ${payload.boq_number}` });
    if (isNew) navigate(`/boqs/${res.data.id}`, { replace: true });
  }

  async function saveRemarks() {
    if (!boqId) {
      toast({ title: "Save the BOQ first", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Build audit entries for any changed remarks
    const originalMap = new Map(originalItems.map((it) => [it.id, it]));
    const changed = items
      .map((it) => {
        const orig = originalMap.get(it.id);
        if (!orig) return null;
        if ((orig.remarks || "").trim() === (it.remarks || "").trim()) return null;
        return { item: it, oldRemarks: orig.remarks || "" };
      })
      .filter(Boolean) as { item: BoqLineItem; oldRemarks: string }[];

    if (changed.length) {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      const userName = (user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || "";
      const auditEntries = changed.map((c) => ({
        boq_id: boqId,
        item_id: c.item.id,
        item_no: c.item.item_no,
        model_number: c.item.model_number,
        old_remarks: c.oldRemarks,
        new_remarks: c.item.remarks || "",
        changed_by: user?.id || null,
        changed_by_email: user?.email || null,
        changed_by_name: userName || null,
      }));
      try {
        await insertRemarksAuditLogs(auditEntries);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setSaving(false);
        return toast({ title: "Audit log failed", description: msg, variant: "destructive" });
      }
    }

    const { error } = await supabase.from("boqs").update({ line_items: items } as never).eq("id", boqId);
    setSaving(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    setOriginalItems(JSON.parse(JSON.stringify(items)));
    toast({ title: "Remarks saved" });
  }

  async function downloadPDF() {
    const doc = await generateBoqPDF(buildRecord());
    const safe = (boqNumber || "BOQ").replace(/[/\\]/g, "_");
    doc.save(`${safe}.pdf`);
    toast({ title: "BOQ PDF downloaded" });
  }

  async function uploadToBoqFolder() {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return toast({ title: "Upload failed", description: "Please sign in again.", variant: "destructive" });
    // Persist the BOQ record first so it appears in the BOQ folder list.
    const payload = {
      order_id: orderId,
      boq_number: boqNumber || deriveBoqNumber(referenceOa),
      version, format,
      status,
      prepared_by: preparedBy || null, boq_date: boqDate,
      reference_oa_number: referenceOa || null, project_number: projectNumber || null,
      client_name: clientName || null, line_items: items, terms, notes,
    };
    let savedId = boqId;
    if (!savedId) {
      const ins = await supabase.from("boqs").insert(payload as never).select().single();
      if (ins.error) return toast({ title: "Save failed", description: ins.error.message, variant: "destructive" });
      savedId = (ins.data as { id: string }).id;
      setBoqId(savedId);
    } else {
      const upd = await supabase.from("boqs").update(payload as never).eq("id", savedId);
      if (upd.error) return toast({ title: "Save failed", description: upd.error.message, variant: "destructive" });
    }
    const doc = await generateBoqPDF(buildRecord());
    const blob = doc.output("blob");
    const safe = (boqNumber || "BOQ").replace(/[/\\]/g, "_");
    const path = `${uid}/${orderId}/${safe}-v${version}.pdf`;
    const { error } = await supabase.storage.from("boq-documents").upload(path, blob, { upsert: true, contentType: "application/pdf" });
    if (error) return toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    toast({ title: "Saved to BOQ folder", description: boqNumber || payload.boq_number });
    if (isNew && savedId) navigate(`/boqs/${savedId}`, { replace: true });
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
                <span className="inline-flex items-center rounded-full bg-muted text-foreground text-[11px] font-medium px-2 py-0.5">
                  {statusLabel(designReviewStatus)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={uploadToBoqFolder}>Save to BOQ Folder</Button>
            {canEditRemarks && (
              <Button size="sm" disabled={saving} onClick={saveRemarks}>
                <Save className="mr-1 h-4 w-4" />Save Remarks
              </Button>
            )}
          </div>
        </div>

        {verificationStatus === "pending_verification" && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm print:hidden">
            <div className="font-medium text-amber-700 dark:text-amber-400">Pending Senior Approval</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Senior is reviewing item-wise. BOQ data is mirrored from the latest OA.
              Only the OA/BOQ creator can edit Remarks.
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

        {verificationStatus === "rejected" && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm print:hidden">
            <div className="font-medium text-destructive">Rejected — Changes Required</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Senior rejected one or more items. Update the linked OA — saving the OA again will
              auto-refresh this BOQ and re-send it for senior approval.
            </p>
          </div>
        )}

        <Tabs defaultValue="document" className="space-y-5">
          <TabsList className="print:hidden">
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="history"><History className="mr-1 h-3.5 w-3.5" />PDF History</TabsTrigger>
            <TabsTrigger value="audit"><FileText className="mr-1 h-3.5 w-3.5" />Remarks Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="document" className="space-y-5 mt-0">
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
                  All BOQ fields mirror the linked OA. Only Remarks are editable, and only by the OA/BOQ creator.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Synced from OA. Only Remarks editable (OA/BOQ creator only). Senior approval is item-wise.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_90px] gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <div>Item</div><div>Model</div><div>Description</div><div>Qty</div><div>Unit</div><div>Remarks</div><div>Approval</div>
                </div>
                <BoqItemsList
                  key={`items-${refreshKey}`}
                  items={items}
                  canEditRemarks={canEditRemarks}
                  boqId={boqId}
                  onUpdate={updateItem}
                />
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

            <DesignReviewPanel
              boq={{ id: boqId, user_id: oaOwnerId, boq_number: boqNumber, client_name: clientName, project_number: projectNumber }}
              items={items}
              designReviewStatus={designReviewStatus}
              onChange={async () => {
                if (!boqId) return;
                const { data } = await supabase.from("boqs").select("design_review_status").eq("id", boqId).maybeSingle();
                const s = (data as { design_review_status?: string } | null)?.design_review_status;
                if (s) setDesignReviewStatus(s);
                setRefreshKey((k) => k + 1);
              }}
            />

            <RevisionsTable boqId={boqId} currentLabel={`R${(version) || 1}`} />
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
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <BoqPdfHistory orderId={orderId} currentBoqNumber={boqNumber} />
          </TabsContent>

          <TabsContent value="audit" className="mt-0">
            <RemarksAuditPanel boqId={boqId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  function updateItem(idv: string, patch: Partial<BoqLineItem>) {
    setItems((p) => p.map((it) => it.id === idv ? { ...it, ...patch } : it));
  }
  // Item rows can no longer be added/removed manually — they always
  // come from the linked OA. Helper kept for future use.
}

function BoqItemsList({
  items, canEditRemarks, boqId, onUpdate,
}: {
  items: BoqLineItem[];
  canEditRemarks: boolean;
  boqId: string | null;
  onUpdate: (id: string, patch: Partial<BoqLineItem>) => void;
}) {
  const data = useLatestDesignReview(boqId);
  const byItemId = new Map((data?.items || []).map((r) => [r.boq_item_id, r]));
  return (
    <>
      {items.map((it) => {
        const r = byItemId.get(it.id);
        return (
          <div key={it.id} className="space-y-1.5">
            <div className="grid grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_90px] gap-1.5 items-start">
              <div className="h-9 flex items-center px-2 text-sm">{it.item_no}</div>
              <div className="h-9 flex items-center px-2 text-sm">{it.model_number}</div>
              <div className="min-h-9 py-2 px-2 text-sm whitespace-pre-wrap">{it.description}</div>
              <div className="h-9 flex items-center px-2 text-sm">{it.quantity}</div>
              <div className="h-9 flex items-center px-2 text-sm">{it.unit}</div>
              <Textarea
                value={it.remarks}
                onChange={(e) => onUpdate(it.id, { remarks: e.target.value })}
                readOnly={!canEditRemarks}
                className="min-h-9"
                rows={1}
              />
              <div className="text-[11px] pt-2">
                {it.approval_status === "approved" ? (
                  <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">Approved</span>
                ) : it.approval_status === "rejected" ? (
                  <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-medium" title={it.approval_comment || ""}>Rejected</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5">Pending</span>
                )}
              </div>
            </div>
            {r && data && (
              <div className="pl-12 pr-1">
                <DesignCommentRow item={r} docs={data.docs} round={data.round} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
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

/* -------- PDF History tab: lists all snapshots for this OA -------- */
type HistoryEntry = {
  path: string;
  name: string;
  label: string;
  revision: number | null;
  isCurrent: boolean;
  updatedAt: string | null;
};

function parseRevisionFromName(name: string): number | null {
  const m = name.match(/-R(\d+)-/i) || name.match(/-v(\d+)\.pdf$/i);
  return m ? Number(m[1]) : null;
}

function BoqPdfHistory({ orderId, currentBoqNumber }: { orderId: string; currentBoqNumber: string }) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setLoading(false); return; }

      const baseDir = `${uid}/${orderId}`;
      const [curList, histList] = await Promise.all([
        supabase.storage.from("boq-documents").list(baseDir, { limit: 100, sortBy: { column: "updated_at", order: "desc" } }),
        supabase.storage.from("boq-documents").list(`${baseDir}/history`, { limit: 200, sortBy: { column: "updated_at", order: "desc" } }),
      ]);

      const out: HistoryEntry[] = [];
      (curList.data || []).forEach((f) => {
        if (!f.name?.toLowerCase().endsWith(".pdf")) return;
        const rev = parseRevisionFromName(f.name);
        out.push({
          path: `${baseDir}/${f.name}`,
          name: f.name,
          label: `${currentBoqNumber || f.name.replace(/\.pdf$/i, "")} (Current)`,
          revision: rev,
          isCurrent: true,
          updatedAt: (f as { updated_at?: string }).updated_at || null,
        });
      });
      (histList.data || []).forEach((f) => {
        if (!f.name?.toLowerCase().endsWith(".pdf")) return;
        const rev = parseRevisionFromName(f.name);
        const base = f.name.replace(/-\d{8,}.*\.pdf$/i, "").replace(/\.pdf$/i, "");
        out.push({
          path: `${baseDir}/history/${f.name}`,
          name: f.name,
          label: rev === 0 ? `${base} (Original)` : `${base}`,
          revision: rev,
          isCurrent: false,
          updatedAt: (f as { updated_at?: string }).updated_at || null,
        });
      });

      out.sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        const ar = a.revision ?? -1, br = b.revision ?? -1;
        return br - ar;
      });
      setEntries(out);
      setLoading(false);
    })();
  }, [orderId, currentBoqNumber]);

  async function openOrDownload(entry: HistoryEntry, mode: "view" | "download") {
    setBusyPath(entry.path);
    try {
      const { data, error } = await supabase.storage.from("boq-documents").createSignedUrl(entry.path, 60 * 10, mode === "download" ? { download: entry.name } : undefined);
      if (error || !data?.signedUrl) throw error || new Error("Failed to get URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: mode === "view" ? "View failed" : "Download failed", description: msg, variant: "destructive" });
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">BOQ PDF History</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every saved snapshot for this OA — Original, R1, R2, R3 and the current version.
          Old PDFs are preserved automatically when the linked OA is revised.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved BOQ PDFs yet. Use <span className="font-medium">Save to BOQ Folder</span> to store the current PDF.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {entries.map((e) => (
              <div key={e.path} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm truncate flex items-center gap-2">
                    {e.label}
                    {e.revision !== null && (
                      <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                        R{e.revision}
                      </span>
                    )}
                    {e.isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium uppercase">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {e.name}{e.updatedAt ? ` • ${new Date(e.updatedAt).toLocaleString("en-IN")}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" disabled={busyPath === e.path} onClick={() => openOrDownload(e, "view")}>
                    <Eye className="h-3.5 w-3.5 mr-1" />View
                  </Button>
                  <Button variant="outline" size="sm" disabled={busyPath === e.path} onClick={() => openOrDownload(e, "download")}>
                    <Download className="h-3.5 w-3.5 mr-1" />PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------- Remarks Audit Panel: shows who changed Remarks and when -------- */
function RemarksAuditPanel({ boqId }: { boqId: string | null }) {
  const [entries, setEntries] = useState<Array<{
    id: string;
    item_no: string | null;
    model_number: string | null;
    old_remarks: string | null;
    new_remarks: string;
    changed_by_name: string | null;
    changed_by_email: string | null;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boqId) { setLoading(false); setEntries([]); return; }
    (async () => {
      setLoading(true);
      try {
        const data = await fetchRemarksAuditLog(boqId);
        setEntries(data);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [boqId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Remarks Audit Log</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every edit to the Remarks column is recorded here with the user name, email, and timestamp.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading audit log…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No remarks edits recorded yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {entries.map((e) => (
              <div key={e.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-sm">
                    Item {e.item_no}{e.model_number ? ` • ${e.model_number}` : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  by <span className="font-medium text-foreground">{e.changed_by_name || e.changed_by_email || "Unknown"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                  <div className="rounded bg-muted/50 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Old</div>
                    <div className="whitespace-pre-wrap">{e.old_remarks || "(empty)"}</div>
                  </div>
                  <div className="rounded bg-primary/5 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-primary mb-0.5">New</div>
                    <div className="whitespace-pre-wrap">{e.new_remarks}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
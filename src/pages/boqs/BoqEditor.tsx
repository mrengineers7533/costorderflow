import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowUp, Download, Eye, FileText, History, Link2, Printer, Save, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { DEFAULT_BOQ_TERMS, deriveBoqNumber, sortByItemNo } from "@/lib/boq/types";
import { generateBoqPDF } from "@/lib/boq/pdf";
import type { OrderRecord } from "@/lib/orders/types";
import mrLogoUrl from "@/assets/mr-logo.png";
import gmsLogoUrl from "@/assets/gms-logo.png";
import ugurLogoUrl from "@/assets/ugur-logo.png";
import { DesignReviewPanel } from "@/components/boqs/DesignReviewPanel";
import { useLatestDesignReview } from "@/components/boqs/DesignCommentsInline";
import { BoqItemChangeHistoryButton } from "@/components/boqs/BoqItemChangeHistoryButton";
import { findReviewItemForOaItem, parseColumnComments, type ColKey } from "@/lib/orders/designComments";
import type { DesignReviewItemRow, DesignReviewRow } from "@/lib/boq/designReview";
import { RevisionsTable } from "@/components/boqs/RevisionsTable";
import { BoqRevisionHistory } from "@/components/boqs/BoqRevisionHistory";
import { PendingChangesPanel } from "@/components/boqs/PendingChangesPanel";
import { statusLabel, snapshotRevision, diffItemsAgainstBaseline, buildChangeLog, fetchLatestSubmittedRound } from "@/lib/boq/designReview";
import { fetchRemarksAuditLog, insertRemarksAuditLogs } from "@/lib/boq/auditLog";
import { DistributeBoqDialog } from "@/components/boqs/DistributeBoqDialog";
import { useColumnToggle } from "@/hooks/useColumnToggle";
import { Columns3 } from "lucide-react";

function newBoqItem(seq: number): BoqLineItem {
  return { id: crypto.randomUUID(), item_no: String(seq), model_number: "", description: "", quantity: 1, unit: "Nos", remarks: "", make: "" };
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
  const [isCurrentBoq, setIsCurrentBoq] = useState<boolean>(true);
  const [boqRevision, setBoqRevision] = useState<number>(0);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [showMake, setShowMake] = useColumnToggle("boq.columns.make", false);

  const isCreator = !!currentUserId && (currentUserId === oaOwnerId || currentUserId === boqUserId);
  // Remarks is the ONLY editable field, and only by the OA/BOQ creator.
  const canEditRemarks = isCreator;
  const locked = designReviewStatus === "design_approved" || designReviewStatus === "final_sent";
  // After comments are received (or while iterating), the creator can edit any item field.
  const canEditFull = isCreator && !locked && (
    designReviewStatus === "review_received" ||
    designReviewStatus === "changes_required" ||
    designReviewStatus === "boq_updated" ||
    designReviewStatus === "draft"
  );
  const isDirty = JSON.stringify(items) !== JSON.stringify(originalItems);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  // Sync per-item approval_status from the latest submitted Approval round.
  // approved -> approved, change_required -> rejected, pending -> pending.
  useEffect(() => {
    if (!boqId) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await fetchLatestSubmittedRound(boqId);
        if (!latest || cancelled) return;
        if (latest.round.kind !== "approval") return;
        const byId = new Map(latest.items.map((r) => [r.boq_item_id, r]));
        const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");
        const byDesc = new Map<string, typeof latest.items[number]>();
        latest.items.forEach((r) => { const k = norm(r.description); if (k && !byDesc.has(k)) byDesc.set(k, r); });
        const map = (d: string | null | undefined): "approved" | "rejected" | "pending" =>
          d === "approved" ? "approved" : d === "change_required" ? "rejected" : "pending";
        let changed = false;
        const next = items.map((it) => {
          const r = byId.get(it.id) || byDesc.get(norm(it.description));
          if (!r) return it;
          const ns = map(r.decision);
          if ((it as BoqLineItem & { approval_status?: string }).approval_status === ns) return it;
          changed = true;
          return { ...it, approval_status: ns } as BoqLineItem;
        });
        if (!changed || cancelled) return;
        setItems(next);
        setOriginalItems((prev) => prev.map((it) => {
          const r = byId.get(it.id) || byDesc.get(norm(it.description));
          return r ? ({ ...it, approval_status: map(r.decision) } as BoqLineItem) : it;
        }));
        await supabase.from("boqs").update({ line_items: next } as never).eq("id", boqId);
        // Propagate approval_status to sibling BOQs in the same OA family so
        // the main/other BOQ revisions reflect the latest item-wise decisions.
        try {
          if (orderId) {
            const { data: oaRow } = await supabase
              .from("orders").select("id,parent_order_id").eq("id", orderId).maybeSingle();
            const root = (oaRow as { id: string; parent_order_id: string | null } | null)?.parent_order_id
              || (oaRow as { id: string } | null)?.id || orderId;
            const { data: fam } = await supabase
              .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
            const familyIds = (fam || []).map((r: { id: string }) => r.id);
            if (familyIds.length) {
              const { data: sibs } = await supabase
                .from("boqs").select("id,line_items").in("order_id", familyIds);
              const decisionByDesc = new Map<string, "approved" | "rejected" | "pending">();
              latest.items.forEach((r) => {
                const k = norm(r.description);
                if (k) decisionByDesc.set(k, map(r.decision));
              });
              for (const sib of (sibs || []) as unknown as Array<{ id: string; line_items: BoqLineItem[] }>) {
                if (sib.id === boqId) continue;
                let touched = false;
                const updated = (sib.line_items || []).map((it) => {
                  const ns = decisionByDesc.get(norm(it.description));
                  if (!ns) return it;
                  if ((it as BoqLineItem & { approval_status?: string }).approval_status === ns) return it;
                  touched = true;
                  return { ...it, approval_status: ns } as BoqLineItem;
                });
                if (touched) {
                  await supabase.from("boqs").update({ line_items: updated } as never).eq("id", sib.id);
                }
              }
            }
          }
        } catch (e) {
          console.warn("approval_status sibling propagation failed", e);
        }
      } catch (e) {
        console.warn("approval_status sync failed", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boqId, orderId, refreshKey, designReviewStatus]);

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
        setIsCurrentBoq(b.is_current !== false);
        setBoqRevision(b.revision ?? 0);
        // Saved BOQ is a fixed snapshot: header + items come from the saved
        // record and are NOT auto-refreshed from the linked OA. The OA is
        // fetched only to resolve the OA owner (for edit permissions).
        const nextItems: BoqLineItem[] = b.line_items?.length ? b.line_items : [newBoqItem(1)];
        if (b.order_id) {
          const { data: oa } = await supabase.from("orders").select("user_id").eq("id", b.order_id).maybeSingle();
          if (oa) setOaOwnerId((oa as { user_id: string | null }).user_id || null);
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
    setOriginalItems(JSON.parse(JSON.stringify(items)));
    if (shouldFlipStatus && boqId) {
      try {
        // Diff prev (originalItems captured at load) vs current items so the
        // revision row carries a structured "what changed" payload.
        const { data: auth } = await supabase.auth.getUser();
        const userName =
          (auth.user?.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() ||
          auth.user?.email || null;
        const baselineRows = originalItems.map((it) => ({
          id: "",
          review_id: "",
          boq_item_id: it.id,
          item_no: it.item_no ?? null,
          model_number: it.model_number ?? null,
          description: it.description ?? null,
          quantity: it.quantity ?? null,
          unit: it.unit ?? null,
          remarks: it.remarks ?? null,
          decision: "pending" as const,
          comment: null,
          design_change_note: null,
          decided_at: null,
          column_comments: null,
        }));
        const diffs = diffItemsAgainstBaseline(baselineRows as never, items);
        const changes = buildChangeLog(diffs, userName);
        await snapshotRevision({
          boqId,
          lineItems: items as unknown[],
          designReviewStatus: "boq_updated",
          changes,
          note: "Creator update after Design comments",
        });
      } catch (e) {
        console.warn("snapshotRevision (creator update) failed", e);
      }
    }
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
    const doc = await generateBoqPDF(buildRecord(), { showMake });
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
    const doc = await generateBoqPDF(buildRecord(), { showMake });
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
        {!isNew && !isCurrentBoq && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 print:hidden">
            Viewing superseded revision R{boqRevision} (read-only). Open the current revision from the BOQ Folder or the Revision History below to edit.
          </div>
        )}
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
            {canEditFull && isDirty && (
              <Button size="sm" disabled={saving} onClick={() => save(false)}>
                <Save className="mr-1 h-4 w-4" />Save BOQ Updates
              </Button>
            )}
            {canEditRemarks && !locked && (
              <Button size="sm" disabled={saving} onClick={saveRemarks}>
                <Save className="mr-1 h-4 w-4" />Save Remarks
              </Button>
            )}
          </div>
        </div>

        {/* Quick Action shortcuts */}
        <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-card p-3 shadow-sm print:hidden">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold self-center mr-1">
            Quick Actions
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" />Print View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("design-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Link2 className="mr-1 h-4 w-4" />Create Design Comment Link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("design-review-panel")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <Link2 className="mr-1 h-4 w-4" />Create Design Approval Link
          </Button>
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
                  Saved BOQ snapshot. Header data stays fixed after Save to BOQ Folder and does not change
                  automatically when the OA is edited. Only Remarks are editable, and only by the OA/BOQ creator.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Saved snapshot for this revision. Items are frozen at the moment this BOQ was saved.
                  Only Remarks editable (OA/BOQ creator only). Senior approval is item-wise.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    variant={showMake ? "secondary" : "outline"}
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowMake(!showMake)}
                  >
                    <Columns3 className="h-4 w-4" />
                    {showMake ? "Hide Make column" : "Show Make column"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Hidden by default. Toggle persists per browser and is honored by the PDF/Excel export.
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div
                  className={`grid ${showMake ? "grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_minmax(80px,0.9fr)_60px_60px_minmax(120px,1.4fr)_90px]" : "grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_90px]"} gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1`}
                >
                  <div>Item</div>
                  <div>Model</div>
                  <div>Description</div>
                  {showMake && <div>Make</div>}
                  <div>Qty</div>
                  <div>Unit</div>
                  <div>Remarks</div>
                  <div>Approval</div>
                </div>
                <BoqItemsList
                  key={`items-${refreshKey}`}
                  items={items}
                  canEditRemarks={canEditRemarks}
                  canEditFull={canEditFull}
                  boqId={boqId}
                  orderId={orderId || null}
                  onUpdate={updateItem}
                  showMake={showMake}
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

            <PendingChangesPanel boqId={boqId} items={items} designReviewStatus={designReviewStatus} />

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

            <BoqRevisionHistory currentBoqId={boqId} orderId={orderId || null} />
          </div>

          {/* ---------- Live document preview (below editor) ---------- */}
          <div id="boq-preview">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 print:hidden">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Live Preview</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
                <Button variant="outline" size="sm" onClick={downloadPDF}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
                {verificationStatus === "approved" && boqId && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setDistributeOpen(true)}
                  >
                    <Send className="mr-1 h-4 w-4" />Distribute to Purchase & Factory
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                >
                  <ArrowUp className="mr-1 h-4 w-4" />Go to Top
                </Button>
              </div>
            </div>
            <BoqDocPreview rec={buildRecord()} showMake={showMake} />
          </div>
          </TabsContent>

          <TabsContent value="history" className="mt-0">
            <BoqPdfHistory orderId={orderId} currentBoqNumber={boqNumber} />
          </TabsContent>

          <TabsContent value="audit" className="mt-0">
            <RemarksAuditPanel boqId={boqId} />
          </TabsContent>
        </Tabs>
        {boqId && (
          <DistributeBoqDialog
            open={distributeOpen}
            onOpenChange={setDistributeOpen}
            boq={buildRecord()}
          />
        )}
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
  items, canEditRemarks, canEditFull, boqId, orderId, onUpdate, showMake,
}: {
  items: BoqLineItem[];
  canEditRemarks: boolean;
  canEditFull: boolean;
  boqId: string | null;
  orderId: string | null;
  onUpdate: (id: string, patch: Partial<BoqLineItem>) => void;
  showMake?: boolean;
}) {
  // Latest submitted design-review round for this BOQ. Used to surface
  // per-row comments and approval decisions inline beneath each item.
  const designReview = useLatestDesignReview(boqId);
  return (
    <>
      {items.map((it, idx) => (
          <div key={it.id} className="space-y-1.5">
            <div className={`grid ${showMake ? "grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_minmax(80px,0.9fr)_60px_60px_minmax(120px,1.4fr)_90px]" : "grid-cols-[42px_minmax(100px,1fr)_minmax(160px,2fr)_60px_60px_minmax(120px,1.4fr)_90px]"} gap-1.5 items-start`}>
              <div className="h-9 flex items-center px-2 text-sm">{it.item_no}</div>
              {canEditFull ? (
                <Input value={it.model_number} onChange={(e) => onUpdate(it.id, { model_number: e.target.value })} className="h-9" />
              ) : (
                <div className="h-9 flex items-center px-2 text-sm">{it.model_number}</div>
              )}
              {canEditFull ? (
                <Textarea value={it.description} onChange={(e) => onUpdate(it.id, { description: e.target.value })} className="min-h-9" rows={1} />
              ) : (
                <div className="min-h-9 py-2 px-2 text-sm whitespace-pre-wrap">{it.description}</div>
              )}
              {showMake && (
                canEditFull ? (
                  <Input value={it.make || ""} onChange={(e) => onUpdate(it.id, { make: e.target.value })} className="h-9" />
                ) : (
                  <div className="h-9 flex items-center px-2 text-sm">{it.make || ""}</div>
                )
              )}
              {canEditFull ? (
                <Input type="number" value={it.quantity ?? 0} onChange={(e) => onUpdate(it.id, { quantity: Number(e.target.value) || 0 })} className="h-9" />
              ) : (
                <div className="h-9 flex items-center px-2 text-sm">{it.quantity}</div>
              )}
              {canEditFull ? (
                <Input value={it.unit || ""} onChange={(e) => onUpdate(it.id, { unit: e.target.value })} className="h-9" />
              ) : (
                <div className="h-9 flex items-center px-2 text-sm">{it.unit}</div>
              )}
              <Textarea
                value={it.remarks}
                onChange={(e) => onUpdate(it.id, { remarks: e.target.value })}
                readOnly={!canEditRemarks && !canEditFull}
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
            {designReview && (
              <BoqDesignSuggestionRow
                reviewItem={findReviewItemForOaItem(designReview.items, it as never, idx)}
                round={designReview.round}
                canApply={canEditFull || canEditRemarks}
                onApply={(patch) => onUpdate(it.id, patch)}
              />
            )}
            {orderId && (
              <div className="flex justify-end -mt-1">
                <BoqItemChangeHistoryButton orderId={orderId} item={it} />
              </div>
            )}
          </div>
      ))}
    </>
  );
}

/** Inline "Design Suggested Update" block shown below a BOQ item row. Mirrors
 *  the equivalent block in the OA editor: surfaces design-team per-column
 *  comments, an Apply button per column, and the approval decision/change
 *  note when the latest review round is of kind "approval". Pure UI — no
 *  impact on BOQ save or revision flow. */
function BoqDesignSuggestionRow({
  reviewItem, round, canApply, onApply,
}: {
  reviewItem: DesignReviewItemRow | null;
  round: DesignReviewRow;
  canApply: boolean;
  onApply: (patch: Partial<BoqLineItem>) => void;
}) {
  if (!reviewItem) return null;
  const cols = parseColumnComments(reviewItem);
  const tiles: { key: ColKey; label: string }[] = [
    { key: "model", label: "Model" },
    { key: "description", label: "Description" },
    { key: "quantity", label: "Qty" },
    { key: "unit", label: "Unit" },
    { key: "remarks", label: "Remarks" },
  ];
  const val = (k: ColKey) => ((cols as Record<string, string>)[k] || "").trim();
  const present = tiles.filter(({ key }) => val(key) !== "");
  const isApproval = round.kind === "approval";
  const decision = reviewItem.decision;
  const changeNote = (reviewItem.design_change_note || "").trim();
  if (!present.length && !isApproval && !changeNote) return null;

  const applyCell = (k: ColKey) => {
    if (!canApply) return;
    const v = val(k);
    if (k === "model") onApply({ model_number: v });
    else if (k === "description") onApply({ description: v });
    else if (k === "quantity") onApply({ quantity: Number(v) || 0 });
    else if (k === "unit") onApply({ unit: v });
    else if (k === "remarks") onApply({ remarks: v });
  };

  const decisionPill = isApproval ? (
    decision === "approved" ? (
      <span className="inline-flex items-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Approved</span>
    ) : decision === "change_required" ? (
      <span className="inline-flex items-center rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Change Required</span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Pending</span>
    )
  ) : null;

  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
          Design {isApproval ? "Approval" : "Comments"} · R{round.round_no}
        </span>
        {decisionPill}
        {round.reviewer_name && (
          <span className="text-[10px] text-muted-foreground">· {round.reviewer_name}</span>
        )}
        {present.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={!canApply}
            onClick={() => applyCell(t.key)}
            title={canApply ? `Apply suggested ${t.label} → BOQ: ${val(t.key)}` : "You don't have permission to edit this field"}
            className="rounded border border-primary/50 bg-background px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply {t.label}
            <span className="ml-1 text-[10px] text-muted-foreground">→ BOQ</span>
          </button>
        ))}
      </div>
      {present.length > 0 && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${present.length}, minmax(0, 1fr))` }}>
          {present.map((t) => (
            <div key={t.key} className="px-1.5 py-1 rounded bg-background/60">
              <div className="text-[10px] uppercase text-muted-foreground">{t.label}</div>
              <div className="whitespace-pre-wrap text-foreground">{val(t.key)}</div>
            </div>
          ))}
        </div>
      )}
      {changeNote && (
        <div className="text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">Change note:</span> {changeNote}</div>
      )}
    </div>
  );
}

/* -------- BOQ document-style preview — mirrors generated PDF 1:1 --------
   Uses A4 proportions (210x297mm) so on-screen layout matches the exported PDF
   exactly: same header, accent rule, BOQ title bar, two-column meta block,
   table column widths, header colors, terms box, and notes line. */
function BoqDocPreview({ rec, showMake = false }: { rec: BoqRecord; showMake?: boolean }) {
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
        <div style={{ position: "relative", background: "rgb(200,200,200)", textAlign: "center", fontWeight: 700, fontSize: "12pt", padding: "1.5mm 0" }}>
          BOQ
          {(() => {
            const vs = (rec.verification_status || "").toLowerCase();
            let label = "", bg = "";
            if (vs === "approved") { label = "APPROVED"; bg = "rgb(22,128,51)"; }
            else if (vs === "rejected") { label = "CHANGES REQUESTED"; bg = "rgb(200,30,30)"; }
            else if (vs === "pending_verification") { label = "PENDING APPROVAL"; bg = "rgb(180,120,0)"; }
            if (!label) return null;
            return (
              <span style={{ position: "absolute", right: "2mm", top: "50%", transform: "translateY(-50%)", background: bg, color: "white", fontSize: "7.5pt", fontWeight: 700, padding: "0.6mm 2mm", borderRadius: "1mm", letterSpacing: "0.3px" }}>{label}</span>
            );
          })()}
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
            {showMake && <col style={{ width: "22mm" }} />}
            <col style={{ width: "14mm" }} />
            <col style={{ width: "14mm" }} />
            <col style={{ width: "38mm" }} />
            <col style={{ width: "24mm" }} />
          </colgroup>
          <thead>
            <tr style={{ background: isMR ? "rgb(234,88,12)" : "rgb(120,120,120)", color: "white" }}>
              {(showMake
                ? ["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "MAKE", "QTY", "UNIT", "Remarks", "Approved by Design"]
                : ["ITEM No.", "MODEL NUMBER", "DESCRIPTION", "QTY", "UNIT", "Remarks", "Approved by Design"]
              ).map((h, i) => {
                const center = showMake
                  ? (i === 0 || i === 4 || i === 5 || i === 7)
                  : (i === 0 || i === 3 || i === 4 || i === 6);
                return (
                  <th key={h} style={{ border: "0.2mm solid #000", padding: "1.5mm", fontWeight: 700, textAlign: center ? "center" : "left" }}>{h}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rec.line_items.length === 0 ? (
              <tr><td colSpan={showMake ? 8 : 7} style={{ border: "0.2mm solid #000", padding: "3mm", textAlign: "center", fontStyle: "italic", color: "#777" }}>(no items)</td></tr>
            ) : rec.line_items.map((it, i) => (
              <tr key={it.id} style={{ verticalAlign: "top" }}>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.item_no || i + 1}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm" }}>{it.model_number}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", whiteSpace: "pre-wrap" }}>{it.description}</td>
                {showMake && <td style={{ border: "0.2mm solid #000", padding: "1.5mm" }}>{(it.make || "")}</td>}
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.quantity || ""}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center" }}>{it.unit}</td>
                <td style={{ border: "0.2mm solid #000", padding: "1.5mm", whiteSpace: "pre-wrap" }}>{it.remarks}</td>
                {(() => {
                  const s = ((it as { approval_status?: string }).approval_status || "pending").toLowerCase();
                  const txt = s === "approved" ? "Approved" : s === "rejected" ? "Rejected" : "Pending";
                  const color = s === "approved" ? "rgb(22,128,51)" : s === "rejected" ? "rgb(200,30,30)" : "rgb(180,120,0)";
                  return (
                    <td style={{ border: "0.2mm solid #000", padding: "1.5mm", textAlign: "center", fontWeight: 700, color }}>{txt}</td>
                  );
                })()}
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
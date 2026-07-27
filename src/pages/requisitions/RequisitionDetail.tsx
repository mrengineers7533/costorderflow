import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Columns3, Copy, Download, Link2, FileDown, Trash2 } from "lucide-react";
import type { RequisitionItemRecord, RequisitionRecord, RequisitionRawMaterialRecord } from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { OrderRecord } from "@/lib/orders/types";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";
import { useColumnToggle } from "@/hooks/useColumnToggle";
import { buildMakeResolver } from "@/lib/boq/makeResolver";
import { EntityActivityBanner } from "@/components/activity/EntityActivityBanner";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteRequisitionCascade, RequisitionDeleteBlockedError } from "@/lib/requisition/delete";
import ConsistencyTab from "@/components/requisitions/ConsistencyTab";
import { BoqItemAttachmentsView, useItemAttachments } from "@/components/boqs/BoqItemAttachmentsView";
import { useDocAccess } from "@/hooks/useDocAccess";
import { groupBoqsByFamily } from "@/lib/boq/familyKey";

import { formatReqPrice, formatReqVendor } from "@/lib/requisition/priceVendor";
import { RAW_MATERIAL_TYPES, RAW_MATERIAL_TYPE_PLACEHOLDER } from "@/lib/requisition/rawMaterialType";

/** Uncontrolled inline text cell — saves on blur only when the value changed. */
function TextCell({
  value,
  onSave,
  width = "w-28",
  align = "left",
  placeholder,
}: {
  value: string | null | undefined;
  onSave: (v: string) => void;
  width?: string;
  align?: "left" | "right";
  placeholder?: string;
}) {
  const initial = value ?? "";
  return (
    <Input
      key={initial}
      className={`h-7 ${width} ${align === "right" ? "text-right" : ""}`}
      defaultValue={initial}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value;
        if (v === initial) return;
        onSave(v);
      }}
    />
  );
}

/** Uncontrolled inline numeric cell. Invalid input shows a row-level message
 *  and reverts only this cell — no other row is touched. */
function NumCell({
  value,
  onSave,
  width = "w-24",
}: {
  value: number | null | undefined;
  onSave: (v: number | null) => void;
  width?: string;
}) {
  const initial = value == null ? "" : String(value);
  const [err, setErr] = useState(false);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Input
        key={initial}
        className={`h-7 ${width} text-right ${err ? "border-destructive" : ""}`}
        defaultValue={initial}
        inputMode="decimal"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (raw === initial) { setErr(false); return; }
          if (raw === "") { setErr(false); onSave(null); return; }
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            setErr(true);
            e.target.value = initial;
            return;
          }
          setErr(false);
          onSave(n);
        }}
      />
      {err ? <span className="text-[10px] text-destructive">Enter a number</span> : null}
    </div>
  );
}

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [req, setReq] = useState<RequisitionRecord | null>(null);
  const [items, setItems] = useState<RequisitionItemRecord[]>([]);
  const [rms, setRms] = useState<RequisitionRawMaterialRecord[]>([]);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [latestRev, setLatestRev] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMake, setShowMake] = useColumnToggle("requisition.columns.make", false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { canEdit: docCanEdit } = useDocAccess("requisition", id);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(((roles as Array<{ role: string }>) || []).some((r) => r.role === "admin"));
      }
    })();
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

async function loadLatestApprovedBoqForFamily(currentBoq: BoqRecord): Promise<BoqRecord | null> {
  const [{ data: allBoqs }, { data: orders }] = await Promise.all([
    supabase
      .from("boqs")
      .select("*")
      .eq("verification_status", "approved"),
    supabase.from("orders").select("id,parent_order_id"),
  ]);
  const grouped = groupBoqsByFamily(
    ((allBoqs as unknown as BoqRecord[]) || []),
    (orders as Array<{ id: string; parent_order_id: string | null }>) || [],
  );
  const familyKey = grouped.familyKeyById.get(currentBoq.id);
  return familyKey ? grouped.latestByFamily.get(familyKey) || null : null;
}

  async function load() {
    if (!id) return;
    const { data: r } = await sb.from("requisitions").select("*").eq("id", id).maybeSingle();
    setReq(r as RequisitionRecord);
    if (!r) { setLoading(false); return; }
    const { data: its } = await sb.from("requisition_items").select("*").eq("requisition_id", id).order("item_no");
    setItems((its as RequisitionItemRecord[]) || []);
    const { data: rmRows } = await sb.from("requisition_raw_materials").select("*").eq("requisition_id", id).order("material");
    setRms((rmRows as RequisitionRawMaterialRecord[]) || []);
    if (r.boq_id) {
      const { data: b } = await supabase.from("boqs").select("*").eq("id", r.boq_id).maybeSingle();
      setBoq(b as unknown as BoqRecord);
      const oaId = (b as { source_order_id?: string; order_id?: string } | null)?.source_order_id
        || (b as { order_id?: string } | null)?.order_id;
      if (oaId) {
        const { data: full } = await supabase.from("orders").select("*").eq("id", oaId).maybeSingle();
        setOrder((full as unknown as OrderRecord) || null);
      }
      const latest = b ? await loadLatestApprovedBoqForFamily(b as unknown as BoqRecord) : null;
      setLatestRev(latest?.revision ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  const shareLink = useMemo(
    () => req ? `${window.location.origin}/requisition/${req.share_token}` : "",
    [req],
  );
  const familyLink = useMemo(
    () => req?.family_token ? `${window.location.origin}/boq/family/${req.family_token}` : "",
    [req],
  );
  // Attachments live on the source BOQ; match req items back to BOQ items by
  // description + model_number signature. Memoised so the hook's effect does
  // not re-fire on every render (which caused a render/fetch loop and made
  // the page visibly jump while the table re-laid out).
  const attItems = useMemo(
    () => items.map((i) => ({ id: i.id, description: i.description, model_number: i.model_number })),
    [items],
  );
  const attMap = useItemAttachments(req?.boq_id ?? null, attItems as never);

  // Stable object identity so ModuleNotifications does not reload on every
  // render of this page.
  const notifLinks = useMemo(
    () => ({
      requisitionId: id as string,
      boqId: req?.boq_id ?? undefined,
      orderRootId:
        (req as { order_root_id?: string | null } | null)?.order_root_id ?? undefined,
    }),
    [id, req],
  );
  const stale = latestRev != null && req != null && latestRev > req.boq_revision;

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    toast({ title: "Link copied" });
  }

  function downloadPDF(format: "default" | "generated" = "default") {
    if (!req || !boq) return;
    const generatedRows = format === "generated" ? buildGeneratedRows() : undefined;
    const doc = generateRequisitionPDF({
      requisition: req,
      items,
      rawMaterials: rms,
      boqNumber: boq.boq_number,
      oaNumber: boq.reference_oa_number || "",
      clientName: boq.client_name || "",
      shareLink,
      familyLink,
      showMake,
      format,
      generatedRows,
    });
    const safe = req.requisition_number.replace(/[/\\]/g, "_");
    doc.save(`${safe}${format === "generated" ? "_generated" : ""}.pdf`);
  }

  async function updateItem(itemId: string, patch: Partial<RequisitionItemRecord>) {
    await sb.from("requisition_items").update(patch).eq("id", itemId);
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, ...patch } : it));
  }

  async function updateRm(rmId: string, patch: Partial<RequisitionRawMaterialRecord>) {
    await sb.from("requisition_raw_materials").update(patch).eq("id", rmId);
    setRms((prev) => prev.map((r) => r.id === rmId ? { ...r, ...patch } : r));
  }

  const hasUnmapped = rms.some((r) => r.source === "unmapped_placeholder");

  // Group RM rows by Finish Good (requisition_item_id), preserving FG order.
  const itemById = useMemo(() => {
    const m = new Map<string, RequisitionItemRecord>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  const rmGroups = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, RequisitionRawMaterialRecord[]>();
    const keyOf = (r: RequisitionRawMaterialRecord) =>
      r.requisition_item_id || `__model__:${r.model_number || "—"}`;
    rms.forEach((r) => {
      const k = keyOf(r);
      if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
      buckets.get(k)!.push(r);
    });
    // sort groups by FG item_no when available
    const numKey = (s: string | null | undefined) => {
      const n = parseFloat(String(s ?? ""));
      return Number.isFinite(n) ? n : 9999;
    };
    order.sort((a, b) => numKey(itemById.get(a)?.item_no) - numKey(itemById.get(b)?.item_no));
    return order.map((k) => ({
      key: k,
      item: itemById.get(k) || null,
      fgLabel: itemById.get(k)?.model_number || itemById.get(k)?.description || buckets.get(k)![0].model_number || "—",
      rms: buckets.get(k)!,
    }));
  }, [rms, itemById]);

  // Map UI status labels to the existing purchase_status enum so the
  // "Generated" view can use the user's vocabulary without a DB migration.
  const STATUS_TO_ENUM: Record<string, "pending" | "ordered" | "received"> = {
    "Pending": "pending",
    "Inhouse": "received",
    "Outside Purchase": "ordered",
  };
  const ENUM_TO_STATUS: Record<string, string> = {
    pending: "Pending",
    received: "Inhouse",
    ordered: "Outside Purchase",
  };

  function buildGeneratedRows() {
    const rows: Array<{
      fgLabel: string;
      fgMake: string;
      fgQty: string;
      material: string;
      size: string;
      rmQty: string;
      rmMake: string;
      uom: string;
      lot: string;
      status: string;
      span: number;
      first: boolean;
    }> = [];
    rmGroups.forEach((g) => {
      const it = g.item;
      const fgLabel = it?.model_number || it?.description || g.fgLabel;
      const fgMake = it ? resolveReqMake(it) : "";
      const fgQty = it?.quantity != null ? String(it.quantity) : "";
      g.rms.forEach((r, idx) => {
        rows.push({
          fgLabel,
          fgMake: fgMake || "—",
          fgQty: fgQty || "—",
          material: r.material,
          size: r.size_model || "—",
          rmQty: r.required_qty != null ? String(r.required_qty) : "—",
          rmMake: r.make || "—",
          uom: r.unit || "—",
          lot: r.lot_no || it?.lot_no || "",
          status: r.raw_material_type || "",
          span: g.rms.length,
          first: idx === 0,
        });
      });
    });
    return rows;
  }

  // Resolve Make for a requisition item: prefer fg_snapshot.make, then
  // the BOQ item's stored Make, then the linked OA's Make (by description
  // /model match or row index).
  const resolveReqMake = useMemo(() => {
    const fromOa = buildMakeResolver(order?.line_items);
    const boqItems = Array.isArray(boq?.line_items) ? boq!.line_items : [];
    const boqById = new Map(boqItems.map((b, i) => [b.id, { item: b, index: i }] as const));
    return (it: RequisitionItemRecord): string => {
      const snap = (it.fg_snapshot as { make?: string } | null)?.make;
      if (snap && snap.trim()) return snap.trim();
      const hit = boqById.get(it.boq_item_id);
      if (hit) return fromOa(hit.item, hit.index);
      return "";
    };
  }, [order, boq]);

  async function regenerate() {
    if (!boq) return;
    // close current
    await sb.from("requisitions").update({ status: "closed" }).eq("id", req!.id);
    // pull latest approved boq for the family
    const latest = await loadLatestApprovedBoqForFamily(boq);
    if (!latest) { toast({ title: "No approved BOQ found", variant: "destructive" }); return; }
    const { error } = await supabase.functions.invoke("create-requisition", { body: { boq_id: latest.id } });
    if (error) { toast({ title: "Regenerate failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Regenerated for latest revision" });
    load();
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5 [overflow-anchor:none]">
        <div className="min-h-[44px]" />
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!req) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5 [overflow-anchor:none]">
        <div className="min-h-[44px]" />
        <div className="text-sm text-muted-foreground">Requisition not found.</div>
      </div>
    );
  }

  const canDelete = isAdmin || docCanEdit || (currentUserId != null && req.user_id === currentUserId);
  const isGeneral = (req as unknown as { kind?: string }).kind === "general";
  const genTitle = (req as unknown as { title?: string | null }).title || "";

  async function handleDelete() {
    if (!req) return;
    setDeleting(true);
    try {
      await deleteRequisitionCascade(req);
      toast({ title: "Requisition deleted", description: req.requisition_number });
      navigate("/requisitions");
    } catch (e) {
      const err = e as Error;
      toast({
        title: err instanceof RequisitionDeleteBlockedError ? "Cannot delete" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
      setDeleting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5 [overflow-anchor:none]">
      <div className="min-h-[44px] space-y-5">
        <EntityActivityBanner orderRootId={(req as { order_root_id?: string | null } | null)?.order_root_id ?? null} />
        {id && <ModuleNotifications links={notifLinks} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">{req.requisition_number}</h1>
            {!isGeneral && <Badge variant="secondary">BOQ R{req.boq_revision}</Badge>}
            {isGeneral && <Badge variant="outline">General</Badge>}
            <Badge>{req.status}</Badge>
            {!isGeneral && stale && <Badge variant="destructive">BOQ revised to R{latestRev}</Badge>}
          </div>
          {isGeneral ? (
            <p className="text-xs text-muted-foreground mt-1">
              {genTitle || "Untitled"} · {req.client_name_override || "—"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              {req.client_name_override || boq?.client_name || "—"} · OA {boq?.reference_oa_number || "—"} · BOQ {boq?.boq_number || "—"}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to="/requisitions"><Button variant="outline" size="sm">Back</Button></Link>
          {!isGeneral && stale && <Button size="sm" onClick={regenerate}>Regenerate for R{latestRev}</Button>}
          {!isGeneral && <Button size="sm" variant="outline" onClick={() => downloadPDF("default")}><Download className="mr-1 h-4 w-4" />PDF</Button>}
          {!isGeneral && <Button size="sm" onClick={() => downloadPDF("generated")}><Download className="mr-1 h-4 w-4" />PDF (Generated)</Button>}
          {canDelete && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />Delete
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={(o) => { if (!o && !deleting) setConfirmDel(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete requisition {req.requisition_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the requisition along with its items, raw-material rows,
              annexures, and the uploaded source file (if any). Active purchase orders that
              reference this requisition will block deletion — cancel those POs first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3 text-xs">
          <Link2 className="h-3.5 w-3.5" />
          <code className="flex-1 truncate text-[11px]">{shareLink}</code>
          <Button size="sm" variant="outline" onClick={copyLink}><Copy className="h-3.5 w-3.5" /></Button>
          <span className="text-muted-foreground">
            Always resolves to the latest approved BOQ revision.
          </span>
        </CardContent>
      </Card>

      {req.upload_file_path && (
        <Card>
          <CardContent className="py-3 flex flex-wrap items-center gap-3 text-xs">
            <FileDown className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">
              Uploaded source file: <b>{req.upload_file_name || req.upload_file_path}</b>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const { data, error } = await supabase.storage
                  .from("requisition-uploads")
                  .createSignedUrl(req.upload_file_path!, 60 * 10);
                if (error || !data?.signedUrl) {
                  toast({ title: "Download failed", description: error?.message, variant: "destructive" });
                  return;
                }
                window.open(data.signedUrl, "_blank", "noopener");
              }}
            >
              <Download className="mr-1 h-3.5 w-3.5" />Download
            </Button>
          </CardContent>
        </Card>
      )}

      {isGeneral ? (
        <Tabs defaultValue="items">
          <TabsList>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="consistency">Consistency</TabsTrigger>
          </TabsList>
          <TabsContent value="items">
            <Card>
              <CardHeader className="space-y-0 py-3">
                <CardTitle className="text-sm">Items ({items.length})</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-3 w-12">#</th>
                      <th className="text-left py-2 pr-3">Description</th>
                      <th className="text-right py-2 pr-3 w-20">Qty</th>
                      <th className="text-left py-2 pr-3 w-20">Unit</th>
                      <th className="text-left py-2 pr-3">Remarks</th>
                      <th className="text-left py-2 pr-3 w-14">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No items parsed from the uploaded file.</td></tr>
                    ) : items.map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{it.item_no}</td>
                        <td className="py-2 pr-3">{it.description}</td>
                        <td className="py-2 pr-3 text-right">{it.quantity ?? "—"}</td>
                        <td className="py-2 pr-3">{it.unit || "—"}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{it.remarks || "—"}</td>
                        <td className="py-2 pr-3"><BoqItemAttachmentsView files={attMap.get(it.id)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="consistency">
            <ConsistencyTab requisitionId={req.id} />
          </TabsContent>
        </Tabs>
      ) : (
      <Tabs defaultValue="generated">
        <TabsList>
          <TabsTrigger value="generated">Generated</TabsTrigger>
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="items">Machine List</TabsTrigger>
          <TabsTrigger value="steel">Steel List</TabsTrigger>
          <TabsTrigger value="outside">Outside Purchase</TabsTrigger>
          <TabsTrigger value="consistency">Consistency</TabsTrigger>
        </TabsList>

        <TabsContent value="generated">
          <Card>
            <CardHeader className="space-y-0 py-3">
              <CardTitle className="text-sm">Generated requisition</CardTitle>
            </CardHeader>
            <CardContent className="relative w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left py-2 px-2 border-r">Finished Good</th>
                    <th className="text-left py-2 px-2 border-r">Make</th>
                    <th className="text-right py-2 px-2 border-r">Qty</th>
                    <th className="text-left py-2 px-2 border-r">Raw Material</th>
                    <th className="text-left py-2 px-2 border-r">Size</th>
                    <th className="text-right py-2 px-2 border-r">RM Qty</th>
                    <th className="text-right py-2 px-2 border-r">Weight</th>
                    <th className="text-left py-2 px-2 border-r">Category</th>
                    <th className="text-left py-2 px-2 border-r">RM Make</th>
                    <th className="text-left py-2 px-2 border-r">UOM</th>
                    <th className="text-right py-2 px-2 border-r">Price</th>
                    <th className="text-left py-2 px-2 border-r">Vendor</th>
                    <th className="text-left py-2 px-2 border-r">Lot</th>
                    <th className="text-left py-2 px-2">Raw Material Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rmGroups.length === 0 ? (
                    <tr><td colSpan={14} className="py-4 text-center text-muted-foreground">No raw materials generated.</td></tr>
                   ) : rmGroups.flatMap((g) => {
                     const it = g.item;
                     const model = it?.model_number || g.fgLabel;
                     const desc = it?.description || "";
                    const fgMake = it ? resolveReqMake(it) : "";
                    const fgQty = it?.quantity != null ? String(it.quantity) : "—";
                    return g.rms.map((r, idx) => (
                      <tr key={r.id} className="border-b last:border-0">
                        {idx === 0 && (
                          <>
                             <td className="py-2 px-2 align-top border-r" rowSpan={g.rms.length}>
                               <div className="font-medium">{model || "—"}</div>
                               {desc && desc !== model ? (
                                 <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-[260px]">
                                   {desc}
                                 </div>
                               ) : null}
                             </td>
                            <td className="py-2 px-2 align-top border-r" rowSpan={g.rms.length}>{fgMake || "—"}</td>
                            <td className="py-2 px-2 align-top border-r text-right" rowSpan={g.rms.length}>{fgQty}</td>
                          </>
                        )}
                        <td className="py-2 px-2 border-r">
                          <TextCell value={r.material} width="w-40" onSave={(v) => updateRm(r.id, { material: v })} />
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell value={r.size_model} width="w-40" onSave={(v) => updateRm(r.id, { size_model: v || null })} />
                        </td>
                        <td className="py-2 px-2 border-r text-right">
                          <NumCell value={r.required_qty} onSave={(v) => updateRm(r.id, { required_qty: v })} />
                        </td>
                        <td className="py-2 px-2 border-r text-right">
                          <NumCell value={r.rm_weight} width="w-20" onSave={(v) => updateRm(r.id, { rm_weight: v })} />
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell
                            value={r.material_category}
                            width="w-32"
                            onSave={(v) => updateRm(r.id, {
                              material_category: v || null,
                              material_category_source: v ? "manual" : null,
                            })}
                          />
                          {r.material_category_source ? (
                            <span className="ml-1 text-[10px] text-muted-foreground">({r.material_category_source})</span>
                          ) : null}
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell value={r.make} width="w-28" onSave={(v) => updateRm(r.id, { make: v || null })} />
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell value={r.unit} width="w-20" onSave={(v) => updateRm(r.id, { unit: v || null })} />
                        </td>
                        <td className="py-2 px-2 border-r text-right">
                          <NumCell value={r.rm_price} onSave={(v) => updateRm(r.id, { rm_price: v })} />
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell value={r.vendor_name} width="w-36" onSave={(v) => updateRm(r.id, { vendor_name: v || null })} />
                        </td>
                        <td className="py-2 px-2 border-r">
                          <TextCell
                            value={r.lot_no ?? ""}
                            width="w-24"
                            onSave={(v) => updateRm(r.id, { lot_no: v || null })}
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Select
                            value={r.raw_material_type || undefined}
                            onValueChange={(v) => updateRm(r.id, { raw_material_type: v })}
                          >
                            <SelectTrigger className="h-7 w-36">
                              <SelectValue placeholder={RAW_MATERIAL_TYPE_PLACEHOLDER} />
                            </SelectTrigger>
                            <SelectContent>
                              {RAW_MATERIAL_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">Raw material indent</CardTitle>
              <Button
                type="button"
                variant={showMake ? "secondary" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setShowMake(!showMake)}
                title="Hidden by default. Also controls the PDF export."
              >
                <Columns3 className="h-4 w-4" />
                {showMake ? "Hide Make column" : "Show Make column"}
              </Button>
            </CardHeader>
            <CardContent className="relative w-full max-w-full overflow-x-auto space-y-3">
              {hasUnmapped && (
                <div className="text-xs rounded border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2">
                  Some Finish Good items have no Raw Material mapping. Configure them in
                  {" "}<Link to="/admin/raw-materials" className="underline font-medium">Admin → Raw Materials</Link>.
                </div>
              )}
              <table className="w-full min-w-[1080px] text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left py-2 px-3 border-r">Finished Good</th>
                    <th className="text-left py-2 px-3 border-r">Raw Material</th>
                    {showMake && <th className="text-left py-2 px-3 border-r">Make</th>}
                    <th className="text-left py-2 px-3 border-r">Size / Spec</th>
                    <th className="text-right py-2 px-3 border-r">Reqd Qty</th>
                    <th className="text-left py-2 px-3 border-r">Unit</th>
                    <th className="text-right py-2 px-3 border-r">Price</th>
                    <th className="text-left py-2 px-3 border-r">Vendor</th>
                    <th className="text-left py-2 px-3">Raw Material Type</th>
                  </tr>
                </thead>
                <tbody>
                  {rmGroups.length === 0 ? (
                    <tr><td colSpan={showMake ? 9 : 8} className="py-4 text-center text-muted-foreground">No raw materials generated.</td></tr>
                   ) : rmGroups.flatMap((g) => g.rms.map((r, idx) => {
                     const unmapped = g.rms.some((x) => x.source === "unmapped_placeholder");
                     const it2 = g.item;
                     const model2 = it2?.model_number || g.fgLabel;
                     const desc2 = it2?.description || "";
                    return (
                      <tr key={r.id} className={`border-b last:border-0 ${r.source === "unmapped_placeholder" ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                        {idx === 0 && (
                           <td className="py-2 px-3 align-top border-r" rowSpan={g.rms.length}>
                             <div className="font-medium">
                               {model2 || "—"}
                               {unmapped && <Badge variant="outline" className="ml-2">Mapping Not Found</Badge>}
                             </div>
                             {desc2 && desc2 !== model2 ? (
                               <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-[260px]">
                                 {desc2}
                               </div>
                             ) : null}
                           </td>
                        )}
                        <td className="py-2 px-3 border-r">{r.material}</td>
                        {showMake && <td className="py-2 px-3 border-r">{r.make || "—"}</td>}
                        <td className="py-2 px-3 border-r">{r.size_model || "—"}</td>
                        <td className="py-2 px-3 border-r text-right">{r.required_qty ?? "—"}</td>
                        <td className="py-2 px-3 border-r">{r.unit || "—"}</td>
                        <td className="py-2 px-3 border-r text-right">{formatReqPrice(r.rm_price)}</td>
                        <td className="py-2 px-3 border-r">{formatReqVendor(r.vendor_name)}</td>
                        <td className="py-2 px-3">
                          <Select
                            value={r.raw_material_type || undefined}
                            onValueChange={(v) => updateRm(r.id, { raw_material_type: v })}
                          >
                            <SelectTrigger className="h-7 w-32">
                              <SelectValue placeholder={RAW_MATERIAL_TYPE_PLACEHOLDER} />
                            </SelectTrigger>
                            <SelectContent>
                              {RAW_MATERIAL_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-sm">Machine List</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Lot Number(s):{" "}
                  <span className="font-medium text-foreground">
                    {Array.from(new Set(items.map((i) => i.lot_no).filter(Boolean))).join(", ") || "—"}
                  </span>
                </p>
              </div>
              <Button
                type="button"
                variant={showMake ? "secondary" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setShowMake(!showMake)}
                title="Hidden by default. Inherited from OA via BOQ."
              >
                <Columns3 className="h-4 w-4" />
                {showMake ? "Hide Make column" : "Show Make column"}
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3 w-8">✓</th>
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Model</th>
                    <th className="text-left py-2 pr-3">Description</th>
                    {showMake && <th className="text-left py-2 pr-3">Make</th>}
                    <th className="text-right py-2 pr-3">Qty</th>
                    <th className="text-left py-2 pr-3">Unit</th>
                    <th className="text-left py-2 pr-3">Lot</th>
                    <th className="text-left py-2 pr-3">Category</th>
                    <th className="text-left py-2 pr-3 w-14">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={showMake ? 10 : 9} className="py-4 text-center text-muted-foreground">No items.</td></tr>
                  ) : items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={it.purchase_status === "checked" || it.purchase_status === "lotted" || it.purchase_status === "ordered"}
                          onCheckedChange={(c) => updateItem(it.id, { purchase_status: c ? "checked" : "pending" })}
                        />
                      </td>
                      <td className="py-2 pr-3">{it.item_no}</td>
                      <td className="py-2 pr-3">{it.model_number}</td>
                      <td className="py-2 pr-3">{it.description}</td>
                      {showMake && (
                        <td className="py-2 pr-3">{resolveReqMake(it) || "—"}</td>
                      )}
                      <td className="py-2 pr-3 text-right">{it.quantity}</td>
                      <td className="py-2 pr-3">{it.unit}</td>
                      <td className="py-2 pr-3">
                        <Input
                          className="h-7 w-20"
                          value={it.lot_no || ""}
                          onChange={(e) => updateItem(it.id, { lot_no: e.target.value || null, purchase_status: e.target.value ? "lotted" : it.purchase_status })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          value={it.purchase_category || ""}
                          onValueChange={(v) => updateItem(it.id, { purchase_category: (v as "steel" | "outside") || null })}
                        >
                          <SelectTrigger className="h-7 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="steel">Steel</SelectItem>
                            <SelectItem value="outside">Outside</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-3"><BoqItemAttachmentsView files={attMap.get(it.id)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {(["steel", "outside"] as const).map((cat) => (
          <TabsContent key={cat} value={cat}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <div>
                  <CardTitle className="text-sm capitalize">{cat} purchase list</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Lot Number(s):{" "}
                    <span className="font-medium text-foreground">
                      {Array.from(new Set(items.filter((i) => i.purchase_category === cat).map((i) => i.lot_no).filter(Boolean))).join(", ") || "—"}
                    </span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant={showMake ? "secondary" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowMake(!showMake)}
                  title="Hidden by default. Inherited from OA via BOQ."
                >
                  <Columns3 className="h-4 w-4" />
                  {showMake ? "Hide Make column" : "Show Make column"}
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-3">#</th>
                      <th className="text-left py-2 pr-3">Model</th>
                      <th className="text-left py-2 pr-3">Description</th>
                      {showMake && <th className="text-left py-2 pr-3">Make</th>}
                      <th className="text-right py-2 pr-3">Qty</th>
                      <th className="text-left py-2 pr-3">Unit</th>
                      <th className="text-left py-2 pr-3">Lot</th>
                      <th className="text-left py-2 pr-3 w-14">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter((i) => i.purchase_category === cat).length === 0 ? (
                      <tr><td colSpan={showMake ? 8 : 7} className="py-4 text-center text-muted-foreground">No items assigned.</td></tr>
                    ) : items.filter((i) => i.purchase_category === cat).map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{it.item_no}</td>
                        <td className="py-2 pr-3">{it.model_number}</td>
                        <td className="py-2 pr-3">{it.description}</td>
                        {showMake && (
                        <td className="py-2 pr-3">{resolveReqMake(it) || "—"}</td>
                        )}
                        <td className="py-2 pr-3 text-right">{it.quantity}</td>
                        <td className="py-2 pr-3">{it.unit}</td>
                        <td className="py-2 pr-3">{it.lot_no || "—"}</td>
                        <td className="py-2 pr-3"><BoqItemAttachmentsView files={attMap.get(it.id)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
        <TabsContent value="consistency">
          <ConsistencyTab requisitionId={req.id} />
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}
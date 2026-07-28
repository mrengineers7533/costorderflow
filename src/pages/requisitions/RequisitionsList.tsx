import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NoSharedDocsHint } from "@/components/access/NoSharedDocsHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Search, Eye, Download, Link2, Send, ClipboardList, Plus, X, Upload, FileUp, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";
import { CreateRequisitionDialog } from "@/components/manufacturing/CreateRequisitionDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteRequisitionCascade, RequisitionDeleteBlockedError } from "@/lib/requisition/delete";
import { ConfirmBulkDeleteDialog } from "@/components/common/ConfirmBulkDeleteDialog";
import type {
  RequisitionRecord,
  RequisitionItemRecord,
  RequisitionRawMaterialRecord,
} from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";
import { buildOrderRootMap, groupBoqsByFamily, pickLatestApprovedBoqsPerFamily } from "@/lib/boq/familyKey";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportRequisitionTemplate } from "@/lib/requisition/uploadTemplate";
import { parseGroupedRequisitionExcel, mapCategoryToPlanStatus } from "@/lib/requisition/parseUpload";
import { financialYearOf } from "@/lib/purchase/poPdf";

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN") : "—";

type OrderFamilyLite = { id: string; parent_order_id?: string | null };

function indexLatestApprovedByOrderId(boqs: BoqRecord[], orders: OrderFamilyLite[]) {
  const rootById = buildOrderRootMap(orders);
  const grouped = groupBoqsByFamily(
    boqs.filter((b) => (b.verification_status ?? "approved") === "approved"),
    rootById,
  );
  const latestByOrder = new Map<string, { rev: number; boqId: string }>();
  for (const groupRows of grouped.groups.values()) {
    const latest = groupRows[0];
    const top = { rev: latest.revision ?? 0, boqId: latest.id };
    for (const b of groupRows) {
      if (b.order_id) latestByOrder.set(b.order_id, top);
      if (b.source_order_id) latestByOrder.set(b.source_order_id, top);
      const root = b.order_id ? rootById.get(b.order_id) : undefined;
      if (root) latestByOrder.set(root, top);
    }
  }
  return latestByOrder;
}

/**
 * Parse an uploaded Excel requisition in the grouped FG+RM format and
 * persist it into requisition_items + requisition_raw_materials so it
 * flows through annexure / PO creation just like a BOQ-generated one.
 *
 * Safe to call from any upload path (general or BOQ-linked). Non-Excel
 * files and empty parses are silently skipped (the source file is still
 * stored against the requisition).
 */
async function persistUploadedRequisitionRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  requisitionId: string,
  file: File,
): Promise<{ groups: number; rms: number } | null> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) return null;
  const groups = await parseGroupedRequisitionExcel(file);
  if (!groups.length) return { groups: 0, rms: 0 };

  const itemRows = groups.map((g, idx) => ({
    requisition_id: requisitionId,
    boq_item_id: `upl-${idx + 1}`,
    item_no: g.s_no != null ? String(g.s_no) : String(idx + 1),
    model_number: null,
    description: g.fg_description || "(Unspecified)",
    quantity: g.fg_quantity,
    unit: g.fg_unit,
    remarks: null,
    fg_snapshot: g as unknown as Record<string, unknown>,
    included_in_requisition: true,
  }));
  const { data: inserted, error: itErr } = await sb
    .from("requisition_items")
    .insert(itemRows)
    .select("id, item_no");
  if (itErr) throw itErr;

  const byItemNo = new Map<string, string>();
  ((inserted as Array<{ id: string; item_no: string | null }>) || []).forEach((r) => {
    if (r.item_no) byItemNo.set(r.item_no, r.id);
  });

  const rmRows: Array<Record<string, unknown>> = [];
  groups.forEach((g, idx) => {
    const reqItemId = byItemNo.get(g.s_no != null ? String(g.s_no) : String(idx + 1)) || null;
    const fgQty = g.fg_quantity;
    for (const rm of g.raw_materials) {
      if (!rm.material && !rm.qty) continue;
      const planStatus = mapCategoryToPlanStatus(rm.category);
      const notes = [
        rm.remarks,
        !planStatus && rm.category ? `Category: ${rm.category}` : null,
      ].filter(Boolean).join(" · ") || null;
      rmRows.push({
        requisition_id: requisitionId,
        requisition_item_id: reqItemId,
        model_number: null,
        make: rm.party_name,
        material: rm.material || "(Unspecified)",
        size_model: rm.size_model,
        qty_per_unit: null,
        fg_quantity: fgQty,
        required_qty: rm.qty,
        unit: rm.unit,
        source: "manual",
        purchase_status: "pending",
        notes,
        lot_no: rm.lot,
        plan_status: planStatus,
      });
    }
  });
  if (rmRows.length) {
    const { error: rmErr } = await sb.from("requisition_raw_materials").insert(rmRows);
    if (rmErr) throw rmErr;
  }
  return { groups: groups.length, rms: rmRows.length };
}

export default function RequisitionsList() {
  const [reqs, setReqs] = useState<RequisitionRecord[]>([]);
  const [boqs, setBoqs] = useState<Record<string, BoqRecord>>({});
  const [latestRevByRoot, setLatestRevByRoot] = useState<Record<string, number>>({});
  const [costSheetByRoot, setCostSheetByRoot] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addBoq, setAddBoq] = useState<BoqRecord | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmDel, setConfirmDel] = useState<RequisitionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<null | { ids: string[]; numbers: string[] }>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(((roles as Array<{ role: string }>) || []).some((r) => r.role === "admin"));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: r } = await sb.from("requisitions").select("*").order("created_at", { ascending: false });
      const list = (r as RequisitionRecord[]) || [];
      setReqs(list);

      const boqIds = Array.from(new Set(list.map((x) => x.boq_id)));
      const rootIds = Array.from(new Set(list.map((x) => x.order_root_id)));
      if (boqIds.length) {
        const { data: b } = await supabase.from("boqs").select("*").in("id", boqIds);
        const map: Record<string, BoqRecord> = {};
        ((b as unknown as BoqRecord[]) || []).forEach((x) => { map[x.id] = x; });
        setBoqs(map);
      }
      if (rootIds.length) {
        // Pull cost_sheet_number from each root order so we can show / filter / search by project.
        const { data: rootOrders } = await supabase
          .from("orders").select("id, cost_sheet_number").in("id", rootIds);
        const csMap: Record<string, string> = {};
        ((rootOrders as Array<{ id: string; cost_sheet_number: string | null }>) || []).forEach((o) => {
          if (o.cost_sheet_number) csMap[o.id] = o.cost_sheet_number;
        });
        setCostSheetByRoot(csMap);

        // compute latest approved revision per family for staleness banner
        const { data: allBoqs } = await supabase
          .from("boqs")
          .select("id, order_id, source_order_id, revised_from_id, boq_number, reference_oa_number, revision, is_current, verification_status, created_at, updated_at");
        const { data: orders } = await supabase.from("orders").select("id, parent_order_id");
        const latestByOrder = indexLatestApprovedByOrderId(
          ((allBoqs as unknown as BoqRecord[]) || []),
          ((orders as OrderFamilyLite[]) || []),
        );
        const latest: Record<string, number> = {};
        latestByOrder.forEach((v, k) => { latest[k] = v.rev; });
        setLatestRevByRoot(latest);

        // Best-effort auto-supersede: for each family where an open requisition
        // is on an older BOQ revision than the latest approved one, ask the
        // server to regenerate the requisition (and cancel its annexures)
        // against the latest BOQ. Idempotent and silent.
        try {
          const stalePerFamily = new Map<string, string>(); // root -> latest boq_id
          for (const r of list) {
            const top = latestByOrder.get(r.order_root_id);
            if (!top) continue;
            if (top.rev > (r.boq_revision ?? 0) && r.status !== "closed") {
              stalePerFamily.set(r.order_root_id, top.boqId);
            }
          }
          if (stalePerFamily.size > 0) {
            await Promise.all(Array.from(stalePerFamily.values()).map((boqId) =>
              supabase.functions.invoke("supersede-on-boq-approval", { body: { boq_id: boqId } }).catch(() => null),
            ));
            // Reload requisitions silently so the new ones appear.
            const { data: r2 } = await sb.from("requisitions").select("*").order("created_at", { ascending: false });
            setReqs((r2 as RequisitionRecord[]) || list);
          }
        } catch (e) {
          console.warn("[RequisitionsList] auto-supersede failed", e);
        }
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reqs.filter((r) => {
      const cs = costSheetByRoot[r.order_root_id] || "";
      if (projectFilter && cs !== projectFilter) return false;
      if (!q) return true;
      const b = boqs[r.boq_id];
      return [r.requisition_number, b?.boq_number, b?.reference_oa_number, b?.client_name, cs]
        .concat(r.client_name_override ? [r.client_name_override] : [])
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [reqs, boqs, search, costSheetByRoot, projectFilter]);

  function toggle(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allOnPageSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((p) => {
      const n = new Set(p);
      if (allOnPageSelected) filtered.forEach((r) => n.delete(r.id));
      else filtered.forEach((r) => n.add(r.id));
      return n;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  async function copyLink(r: RequisitionRecord) {
    const link = `${window.location.origin}/requisition/${r.share_token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: link });
  }

  async function downloadPdf(r: RequisitionRecord) {
    setBusyId(r.id);
    try {
      const b = boqs[r.boq_id];
      const [{ data: its }, { data: rms }] = await Promise.all([
        sb.from("requisition_items").select("*").eq("requisition_id", r.id).order("item_no"),
        sb.from("requisition_raw_materials").select("*").eq("requisition_id", r.id).order("material"),
      ]);
      const shareLink = `${window.location.origin}/requisition/${r.share_token}`;
      const familyLink = r.family_token ? `${window.location.origin}/boq/family/${r.family_token}` : "";
      const doc = generateRequisitionPDF({
        requisition: r,
        items: (its as RequisitionItemRecord[]) || [],
        rawMaterials: (rms as RequisitionRawMaterialRecord[]) || [],
        boqNumber: b?.boq_number || "",
        oaNumber: b?.reference_oa_number || "",
        clientName: b?.client_name || "",
        shareLink,
        familyLink,
      });
      doc.save(`${r.requisition_number.replace(/[/\\]/g, "_")}.pdf`);
    } catch (e) {
      toast({ title: "PDF failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function sendToPurchase(r: RequisitionRecord) {
    setBusyId(r.id);
    const { error } = await sb.from("requisitions").update({ status: "in_purchase" }).eq("id", r.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
      return;
    }
    setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "in_purchase" } : x)));
    toast({ title: "Sent to Purchase" });
  }

  async function handleDelete(r: RequisitionRecord) {
    setDeleting(true);
    try {
      await deleteRequisitionCascade(r);
      setReqs((prev) => prev.filter((x) => x.id !== r.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(r.id); return n; });
      toast({ title: "Requisition deleted", description: r.requisition_number });
      setConfirmDel(null);
    } catch (e) {
      const err = e as Error;
      toast({
        title: err instanceof RequisitionDeleteBlockedError ? "Cannot delete" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  function canDelete(r: RequisitionRecord) {
    return isAdmin || (currentUserId != null && r.user_id === currentUserId);
  }

  async function runBulkDelete() {
    if (!bulkOpen) return;
    setBulkBusy(true);
    let ok = 0; let blocked = 0; let fail = 0; const errs: string[] = [];
    const idSet = new Set(bulkOpen.ids);
    const targets = reqs.filter((r) => idSet.has(r.id));
    for (const r of targets) {
      try { await deleteRequisitionCascade(r); ok++; }
      catch (e) {
        if (e instanceof RequisitionDeleteBlockedError) blocked++;
        else fail++;
        errs.push((e as Error).message);
      }
    }
    setBulkBusy(false);
    setBulkOpen(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = supabase as any;
    const { data: r } = await sbAny.from("requisitions").select("*").order("created_at", { ascending: false });
    setReqs(((r as RequisitionRecord[]) || []));
    setSelected(new Set());
    if (blocked === 0 && fail === 0) {
      toast({ title: `Deleted ${ok} requisition${ok === 1 ? "" : "s"}` });
    } else {
      toast({
        title: `Deleted ${ok}, blocked ${blocked}, failed ${fail}`,
        description: errs.slice(0, 2).join("; "),
        variant: "destructive",
      });
    }
  }

  const distinctProjects = useMemo(() => {
    const set = new Set<string>();
    Object.values(costSheetByRoot).forEach((v) => { if (v) set.add(v); });
    return Array.from(set).sort();
  }, [costSheetByRoot]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Purchase Requisitions</h1>
          <p className="text-xs text-muted-foreground">
            Material requisitions generated by Manufacturing from approved BOQs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/requisitions/consistency">
            <Button size="sm" variant="outline" className="gap-1" title="Verify BOQ ↔ Requisition ↔ Annexure counts">
              <ShieldCheck className="h-4 w-4" />Consistency Check
            </Button>
          </Link>
          <UploadRequisitionButton
            projects={distinctProjects}
            costSheetByRoot={costSheetByRoot}
            onCreated={() => window.location.reload()}
          />
          <AddRequisitionToProjectButton
            projects={distinctProjects}
            onPicked={async (cs) => {
              // Find the latest approved BOQ under any order whose root has this cost-sheet number.
              const rootIds = Object.entries(costSheetByRoot)
                .filter(([, v]) => v === cs)
                .map(([k]) => k);
              if (!rootIds.length) {
                toast({ title: "No project found", variant: "destructive" }); return;
              }
              const { data: orders } = await supabase
                .from("orders").select("id, parent_order_id").or(
                  rootIds.map((id) => `id.eq.${id},parent_order_id.eq.${id}`).join(",")
                );
              const orderIds = ((orders as Array<{ id: string }>) || []).map((o) => o.id);
              if (!orderIds.length) {
                toast({ title: "No OA found for project", variant: "destructive" }); return;
              }
              const { data: bqs } = await supabase
                .from("boqs").select("*").in("order_id", orderIds)
                .eq("verification_status", "approved")
                .order("revision", { ascending: false })
                .order("updated_at", { ascending: false });
              const pick = pickLatestApprovedBoqsPerFamily(
                ((bqs as unknown as BoqRecord[]) || []),
                (orders as OrderFamilyLite[]) || [],
              )[0];
              if (!pick) {
                toast({ title: "No approved BOQ for this project", variant: "destructive" }); return;
              }
              setAddBoq(pick);
              setAddOpen(true);
            }}
          />
          {selected.size > 0 && (
            <>
              <Badge variant="secondary">{selected.size} selected</Badge>
              <Button
                size="sm"
                disabled={selected.size < 1}
                onClick={() => navigate(`/requisitions/plan?ids=${Array.from(selected).join(",")}`)}
                title={selected.size < 1 ? "Select at least 1 to plan" : "Open plan"}
              >
                <ClipboardList className="mr-1 h-4 w-4" />Open Plan
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => {
                    const list = reqs.filter((r) => selected.has(r.id));
                    setBulkOpen({ ids: list.map((r) => r.id), numbers: list.map((r) => r.requisition_number) });
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" />Delete Selected
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={filtered.length === 0}
              onClick={() => setBulkOpen({ ids: filtered.map((r) => r.id), numbers: filtered.map((r) => r.requisition_number) })}
              title="Delete all currently filtered requisitions"
            >
              <Trash2 className="mr-1 h-4 w-4" />Delete All Filtered
            </Button>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search requisition, OA, client, project…" className="h-8 pl-7 w-64"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {projectFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            Project: {projectFilter}
            <button
              type="button"
              onClick={() => setProjectFilter(null)}
              className="ml-1 rounded hover:bg-muted-foreground/20"
              aria-label="Clear project filter"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requisitions yet. Open an approved BOQ in Manufacturing and use "Create Requisition".
            <NoSharedDocsHint />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left py-2 px-3 w-8">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left py-2 px-3">Requisition #</th>
                  <th className="text-left py-2 px-3">OA #</th>
                  <th className="text-left py-2 px-3">Project CS #</th>
                  <th className="text-left py-2 px-3">BOQ #</th>
                  <th className="text-left py-2 px-3">Rev</th>
                  <th className="text-left py-2 px-3">Client</th>
                  <th className="text-left py-2 px-3">Created</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const b = boqs[r.boq_id];
                  const latest = latestRevByRoot[r.order_root_id];
                  const stale = latest != null && latest > r.boq_revision;
                  const sent = r.status === "in_purchase" || r.status === "closed";
                  const cs = costSheetByRoot[r.order_root_id] || "";
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </td>
                      <td className="py-2 px-3 font-medium">{r.requisition_number}</td>
                      <td className="py-2 px-3">{b?.reference_oa_number || "—"}</td>
                      <td className="py-2 px-3">
                        {cs ? (
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            title="Filter to this project"
                            onClick={() => setProjectFilter(cs)}
                          >
                            {cs}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">{b?.boq_number || "—"}</td>
                      <td className="py-2 px-3">R{r.boq_revision}</td>
                      <td className="py-2 px-3 max-w-[220px] truncate">{r.client_name_override || b?.client_name || "—"}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge>{r.status}</Badge>
                          {stale && <Badge variant="destructive">R{latest} avail</Badge>}
                          {r.superseded_by_id && (
                            <Badge variant="outline" className="text-[10px]">Superseded</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/requisitions/${r.id}`}>
                            <Button size="sm" variant="ghost" title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button size="sm" variant="ghost" title="Download PDF"
                                  disabled={busyId === r.id}
                                  onClick={() => downloadPdf(r)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Copy link"
                                  onClick={() => copyLink(r)}>
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant={sent ? "ghost" : "outline"} title="Send to Purchase"
                                  disabled={sent || busyId === r.id}
                                  onClick={() => sendToPurchase(r)}>
                            <Send className="h-4 w-4 mr-1" />
                            {sent ? "Sent" : "Send"}
                          </Button>
                          {canDelete(r) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setConfirmDel(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {addBoq && (
        <CreateRequisitionDialog
          open={addOpen}
          onOpenChange={(o) => { setAddOpen(o); if (!o) setAddBoq(null); }}
          boq={addBoq}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => { if (!o && !deleting) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete requisition {confirmDel?.requisition_number}?</AlertDialogTitle>
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
              onClick={(e) => { e.preventDefault(); if (confirmDel) handleDelete(confirmDel); }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmBulkDeleteDialog
        open={!!bulkOpen}
        onOpenChange={(o) => { if (!o) setBulkOpen(null); }}
        title="Delete requisitions?"
        description="Each requisition and its items, raw materials, annexures, and uploaded source files will be permanently removed. Requisitions referenced by active POs will be skipped."
        items={bulkOpen?.numbers || []}
        busy={bulkBusy}
        onConfirm={runBulkDelete}
      />
    </div>
  );
}

function AddRequisitionToProjectButton({
  projects,
  onPicked,
}: {
  projects: string[];
  onPicked: (cs: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? projects.filter((p) => p.toLowerCase().includes(s)) : projects;
  }, [projects, q]);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add Requisition to Project
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Requisition to Existing Project</DialogTitle>
            <DialogDescription>
              Pick a Project Cost Sheet Number — the new requisition will be linked to it.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search project / cost sheet number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8"
          />
          <div className="max-h-72 overflow-auto border rounded-md divide-y">
            {list.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No projects found.</div>
            ) : list.map((p) => (
              <button
                key={p}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                onClick={async () => {
                  setOpen(false);
                  await onPicked(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type OrderLite = {
  id: string;
  oa_number: string;
  company_name: string | null;
  cost_sheet_number: string | null;
  parent_order_id: string | null;
};
type BoqLite = { id: string; boq_number: string; revision: number; client_name: string | null };

function UploadRequisitionButton({
  projects,
  costSheetByRoot,
  onCreated,
}: {
  projects: string[];
  costSheetByRoot: Record<string, string>;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"project" | "oa" | "general">("project");
  const [csQuery, setCsQuery] = useState("");
  const [pickedCs, setPickedCs] = useState<string | null>(null);
  const [oaQuery, setOaQuery] = useState("");
  const [oaResults, setOaResults] = useState<OrderLite[]>([]);
  const [pickedOa, setPickedOa] = useState<OrderLite | null>(null);
  const [boqOptions, setBoqOptions] = useState<BoqLite[]>([]);
  const [pickedBoqId, setPickedBoqId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [genTitle, setGenTitle] = useState("");

  function reset() {
    setMode("project");
    setCsQuery(""); setPickedCs(null);
    setOaQuery(""); setOaResults([]); setPickedOa(null);
    setBoqOptions([]); setPickedBoqId(null);
    setClientName(""); setNotes(""); setFile(null);
    setGenTitle("");
  }

  const filteredProjects = useMemo(() => {
    const s = csQuery.trim().toLowerCase();
    return s ? projects.filter((p) => p.toLowerCase().includes(s)) : projects;
  }, [projects, csQuery]);

  // OA search (debounced via simple effect)
  useEffect(() => {
    if (mode !== "oa") return;
    const s = oaQuery.trim();
    if (s.length < 2) { setOaResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, oa_number, company_name, cost_sheet_number, parent_order_id")
        .or(`oa_number.ilike.%${s}%,company_name.ilike.%${s}%`)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (!cancelled) setOaResults((data as unknown as OrderLite[]) || []);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, oaQuery]);

  // When an OA is picked, load approved BOQ revisions for it
  useEffect(() => {
    (async () => {
      if (!pickedOa) { setBoqOptions([]); setPickedBoqId(null); return; }
      const { data } = await supabase
        .from("boqs")
        .select("id, order_id, source_order_id, revised_from_id, boq_number, reference_oa_number, revision, is_current, verification_status, client_name, created_at, updated_at")
        .eq("order_id", pickedOa.id)
        .eq("verification_status", "approved")
        .order("revision", { ascending: false });
      const list = pickLatestApprovedBoqsPerFamily(
        (data as unknown as BoqRecord[]) || [],
        [{ id: pickedOa.id, parent_order_id: pickedOa.parent_order_id }],
      ).map((b) => ({ id: b.id, boq_number: b.boq_number, revision: b.revision ?? 0, client_name: b.client_name }));
      setBoqOptions(list);
      setPickedBoqId(list[0]?.id ?? null);
      if (!clientName && (pickedOa.company_name || list[0]?.client_name)) {
        setClientName(pickedOa.company_name || list[0]?.client_name || "");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedOa]);

  async function resolveLinkage(): Promise<{ orderRootId: string; boq: BoqLite; oaNumber: string } | null> {
    if (mode === "project") {
      if (!pickedCs) return null;
      const rootIds = Object.entries(costSheetByRoot).filter(([, v]) => v === pickedCs).map(([k]) => k);
      if (!rootIds.length) return null;
      const orFilter = rootIds.map((id) => `id.eq.${id},parent_order_id.eq.${id}`).join(",");
      const { data: orders } = await supabase
        .from("orders").select("id, oa_number, parent_order_id").or(orFilter);
      const orderList = (orders as Array<{ id: string; oa_number: string; parent_order_id: string | null }>) || [];
      if (!orderList.length) return null;
      const orderIds = orderList.map((o) => o.id);
      const { data: bqs } = await supabase
        .from("boqs").select("id, order_id, source_order_id, revised_from_id, boq_number, reference_oa_number, revision, is_current, verification_status, client_name, created_at, updated_at")
        .in("order_id", orderIds)
        .eq("verification_status", "approved")
        .order("revision", { ascending: false })
        .order("updated_at", { ascending: false });
      const boq = pickLatestApprovedBoqsPerFamily(
        (bqs as unknown as BoqRecord[]) || [],
        orderList,
      )[0] as (BoqLite & { order_id: string }) | undefined;
      if (!boq) return null;
      const sourceOrder = orderList.find((o) => o.id === boq.order_id);
      const rootId = sourceOrder?.parent_order_id || sourceOrder?.id || rootIds[0];
      return { orderRootId: rootId, boq, oaNumber: sourceOrder?.oa_number || "" };
    }
    if (!pickedOa || !pickedBoqId) return null;
    const boq = boqOptions.find((b) => b.id === pickedBoqId);
    if (!boq) return null;
    const rootId = pickedOa.parent_order_id || pickedOa.id;
    return { orderRootId: rootId, boq, oaNumber: pickedOa.oa_number };
  }

  const canSubmit = !!file && !busy && (
    (mode === "project" && !!pickedCs) ||
    (mode === "oa" && !!pickedOa && !!pickedBoqId) ||
    (mode === "general" && genTitle.trim().length > 0)
  );

  async function submit() {
    if (!file) return;
    setBusy(true);
    let stage = "init";
    const fmtErr = (e: unknown) => {
      const x = e as { message?: string; code?: string; details?: string; hint?: string; name?: string };
      const parts = [
        x?.message || String(e),
        x?.code ? `code=${x.code}` : null,
        x?.details ? `details=${x.details}` : null,
        x?.hint ? `hint=${x.hint}` : null,
      ].filter(Boolean);
      return parts.join(" · ");
    };
    try {
      // ===== GENERAL / OTHER REQUISITION =====
      if (mode === "general") {
        stage = "auth";
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) { toast({ title: "Please sign in", variant: "destructive" }); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const fy = financialYearOf();
        stage = "rpc:next_general_requisition_number";
        console.info("[gen-req]", stage, { fy });
        const { data: reqNum, error: rnErr } = await sb.rpc("next_general_requisition_number", { _fy: fy });
        if (rnErr) { console.error("[gen-req]", stage, rnErr); throw rnErr; }
        console.info("[gen-req] got number", reqNum);

        stage = "insert:requisitions";
        const { data: created, error: cErr } = await sb.from("requisitions").insert({
          requisition_number: reqNum,
          order_root_id: null,
          boq_id: null,
          boq_revision: 0,
          family_token: null,
          notes: notes || null,
          client_name_override: clientName.trim() || null,
          title: genTitle.trim(),
          kind: "general",
          user_id: userId,
          status: "issued",
          source: "uploaded",
        }).select("*").single();
        if (cErr) { console.error("[gen-req]", stage, cErr); throw cErr; }
        console.info("[gen-req] inserted requisition", created?.id);

        stage = "storage:upload";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${userId}/${created.id}/${safeName}`;
        console.info("[gen-req]", stage, { path, size: file.size, type: file.type });
        const { error: upErr } = await supabase.storage
          .from("requisition-uploads")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (upErr) { console.error("[gen-req]", stage, upErr); throw upErr; }

        stage = "update:requisitions(file path)";
        const { error: updErr } = await sb.from("requisitions").update({
          upload_file_path: path,
          upload_file_name: file.name,
          upload_mime_type: file.type || null,
        }).eq("id", created.id);
        if (updErr) { console.error("[gen-req]", stage, updErr); throw updErr; }

        // Parse Excel groups (FG + RM) and persist for annexure/PO flow.
        try {
          stage = "parse:excel";
          const result = await persistUploadedRequisitionRows(sb, created.id, file);
          if (result && result.groups === 0 && file.name.toLowerCase().match(/\.xlsx?$/)) {
            toast({
              title: "No items found in Excel",
              description: "The header row must match the template exactly (Sr. No., Finished Good, Raw Material, …).",
              variant: "destructive",
            });
          } else if (result) {
            console.info("[gen-req] persisted groups/rms", result);
          }
        } catch (parseErr) {
          console.error("[gen-req] parse/insert error", parseErr);
          toast({
            title: `Items not saved (stage: ${stage})`,
            description: fmtErr(parseErr),
            variant: "destructive",
          });
        }

        toast({ title: "General requisition uploaded", description: reqNum });
        setOpen(false); reset();
        onCreated();
        return;
      }

      const linkage = await resolveLinkage();
      if (!linkage) {
        toast({ title: "Could not find an approved BOQ for the selection", variant: "destructive" });
        return;
      }
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) { toast({ title: "Please sign in", variant: "destructive" }); return; }

      // Reuse / create family share token
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      let familyToken: string | null = null;
      const { data: existing } = await sb.from("boq_family_share_tokens")
        .select("token").eq("order_root_id", linkage.orderRootId).maybeSingle();
      if (existing?.token) {
        familyToken = existing.token as string;
      } else {
        const { data: ins } = await sb.from("boq_family_share_tokens")
          .insert({ order_root_id: linkage.orderRootId, created_by: userId })
          .select("token").single();
        familyToken = ins?.token as string;
      }

      // Reserve requisition number
      const { data: reqNum, error: rnErr } = await sb.rpc("next_requisition_number", {
        _root: linkage.orderRootId, _oa_number: linkage.oaNumber, _revision: linkage.boq.revision ?? 0,
      });
      if (rnErr) throw rnErr;

      // Insert requisition row
      const { data: created, error: cErr } = await sb.from("requisitions").insert({
        requisition_number: reqNum,
        order_root_id: linkage.orderRootId,
        boq_id: linkage.boq.id,
        boq_revision: linkage.boq.revision ?? 0,
        family_token: familyToken,
        notes: notes || null,
        client_name_override: clientName.trim() || null,
        user_id: userId,
        status: "issued",
        source: "uploaded",
      }).select("*").single();
      if (cErr) throw cErr;

      // Upload file
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${userId}/${created.id}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("requisition-uploads")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) throw upErr;

      // Update row with file info
      await sb.from("requisitions").update({
        upload_file_path: path,
        upload_file_name: file.name,
        upload_mime_type: file.type || null,
      }).eq("id", created.id);

      // Parse and persist FG/RM groups so annexure/PO flow works for
      // uploaded requisitions exactly like BOQ-generated ones.
      try {
        const result = await persistUploadedRequisitionRows(sb, created.id, file);
        if (result) console.info("[req-upload] persisted groups/rms", result);
      } catch (parseErr) {
        console.error("[req-upload] parse/insert error", parseErr);
        toast({
          title: "Items not saved",
          description: (parseErr as Error).message,
          variant: "destructive",
        });
      }

      toast({ title: "Requisition uploaded", description: reqNum });
      setOpen(false); reset();
      onCreated();
    } catch (e) {
      console.error("[req-upload] failed at stage", stage, e);
      toast({
        title: `Upload failed (stage: ${stage})`,
        description: fmtErr(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" /> Upload Requisition
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Requisition</DialogTitle>
            <DialogDescription>
              Upload a PDF or Excel requisition file. Link it to a Project Cost Sheet number or an OA / BOQ revision.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "project" | "oa" | "general")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="project">By Project CS #</TabsTrigger>
              <TabsTrigger value="oa">By OA / BOQ</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
            </TabsList>

            <TabsContent value="project" className="space-y-2 pt-2">
              {pickedCs ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>Project: <b>{pickedCs}</b></span>
                  <Button size="sm" variant="ghost" onClick={() => setPickedCs(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search project / cost sheet number…"
                    value={csQuery}
                    onChange={(e) => setCsQuery(e.target.value)}
                    className="h-8"
                  />
                  <div className="max-h-48 overflow-auto border rounded-md divide-y">
                    {filteredProjects.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">No projects found.</div>
                    ) : filteredProjects.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                        onClick={() => setPickedCs(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="oa" className="space-y-2 pt-2">
              {pickedOa ? (
                <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>OA: <b>{pickedOa.oa_number}</b>{pickedOa.company_name ? ` · ${pickedOa.company_name}` : ""}</span>
                  <Button size="sm" variant="ghost" onClick={() => setPickedOa(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search OA number or client…"
                    value={oaQuery}
                    onChange={(e) => setOaQuery(e.target.value)}
                    className="h-8"
                  />
                  <div className="max-h-48 overflow-auto border rounded-md divide-y">
                    {oaResults.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">Type at least 2 characters.</div>
                    ) : oaResults.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                        onClick={() => setPickedOa(o)}
                      >
                        <div className="font-medium">{o.oa_number}</div>
                        <div className="text-xs text-muted-foreground">{o.company_name || "—"}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {pickedOa && (
                <div>
                  <Label className="text-xs">BOQ Revision</Label>
                  {boqOptions.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No approved BOQ for this OA.</div>
                  ) : (
                    <Select value={pickedBoqId || ""} onValueChange={setPickedBoqId}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Pick a revision" /></SelectTrigger>
                      <SelectContent>
                        {boqOptions.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.boq_number} · R{b.revision}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="general" className="space-y-2 pt-2">
              <div className="space-y-1">
                <Label htmlFor="gen-title" className="text-xs">Requisition Title <span className="text-destructive">*</span></Label>
                <Input
                  id="gen-title"
                  className="h-8"
                  value={genTitle}
                  onChange={(e) => setGenTitle(e.target.value)}
                  placeholder="e.g. Workshop consumables — Nov 2026"
                />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-xs">
                <span>Use the Excel template for clean parsing.</span>
                <Button size="sm" variant="outline" type="button" onClick={() => exportRequisitionTemplate()}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Download Template
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-1">
            <Label htmlFor="up-client" className="text-xs">Client name</Label>
            <Input id="up-client" className="h-8" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Optional — overrides BOQ client" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="up-notes" className="text-xs">Notes</Label>
            <Textarea id="up-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="up-file" className="text-xs">Requisition file (PDF or Excel)</Label>
            <Input
              id="up-file"
              type="file"
              accept=".pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (f && f.size > 20 * 1024 * 1024) {
                  toast({ title: "File too large", description: "Max 20 MB", variant: "destructive" });
                  return;
                }
                setFile(f);
              }}
            />
            {file && <div className="text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit}>
              <FileUp className="mr-1 h-4 w-4" />
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmBulkDeleteDialog } from "@/components/common/ConfirmBulkDeleteDialog";
import { deleteAnnexureCascade, AnnexureDeleteBlockedError } from "@/lib/requisition/annexureDelete";
import { toast } from "@/hooks/use-toast";
import { Download, FileText, Search, XCircle, RotateCcw, Eye, ShoppingCart, Trash2 } from "lucide-react";
import { fmtQty2 } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnnexureRecord, AnnexureRowRecord } from "@/lib/requisition/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type PlanStatus =
  | "machine"
  | "3p"
  | "pipe"
  | "sheet_ss"
  | "sheet_ms"
  | "sheet_gi"
  | "structure"
  | "steel"; // legacy
const TYPE_LABEL: Record<PlanStatus, string> = {
  machine: "Machine List",
  "3p": "Outside Purchase",
  pipe: "Pipe Annexure",
  sheet_ss: "Sheet SS Annexure",
  sheet_ms: "Sheet MS Annexure",
  sheet_gi: "Sheet GI Annexure",
  structure: "Structure Annexure",
  steel: "Steel List (legacy)",
};
const ACTIVE_TYPES: PlanStatus[] = [
  "machine",
  "3p",
  "pipe",
  "sheet_ss",
  "sheet_ms",
  "sheet_gi",
  "structure",
];

type Profile = { id: string; full_name: string | null; email: string | null };

// One row per (annexure × lot × type)
type FolderEntry = {
  annexure: AnnexureRecord;
  lot_no: string;
  type: PlanStatus;
  rows: AnnexureRowRecord[];
  total: number;
  createdByLabel: string;
};

export default function AnnexureFolder() {
  const navigate = useNavigate();
  const [annexures, setAnnexures] = useState<AnnexureRecord[]>([]);
  const [rows, setRows] = useState<AnnexureRowRecord[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | PlanStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cancelled">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [createdByQ, setCreatedByQ] = useState("");

  // View modal
  const [viewEntry, setViewEntry] = useState<FolderEntry | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState<AnnexureRecord | null>(null);
  const [bulkOpen, setBulkOpen] = useState<null | { ids: string[]; labels: string[] }>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (uid) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin(((roles as Array<{ role: string }>) || []).some((r) => r.role === "admin"));
      }
    })();
  }, []);

  async function load() {
    setLoading(true);
    const { data: ax } = await sb
      .from("requisition_annexures")
      .select("*")
      .order("created_at", { ascending: false });
    const axList = (ax as AnnexureRecord[]) || [];
    setAnnexures(axList);
    const ids = axList.map((a) => a.id);
    if (ids.length) {
      const { data: r } = await sb
        .from("requisition_annexure_rows")
        .select("*")
        .in("annexure_id", ids);
      setRows((r as AnnexureRowRecord[]) || []);
    } else {
      setRows([]);
    }
    const uids = Array.from(new Set(axList.map((a) => a.created_by).filter(Boolean) as string[]));
    if (uids.length) {
      const { data: pr } = await sb.from("profiles").select("id, full_name, email").in("id", uids);
      const map: Record<string, Profile> = {};
      ((pr as Profile[]) || []).forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const entries: FolderEntry[] = useMemo(() => {
    const out: FolderEntry[] = [];
    annexures.forEach((a) => {
      const axRows = rows.filter((r) => r.annexure_id === a.id);
      const createdByLabel = a.created_by
        ? (profiles[a.created_by]?.email || profiles[a.created_by]?.full_name || a.created_by.slice(0, 8))
        : "—";
      // Group rows by (lot_no, plan_status)
      const map = new Map<string, AnnexureRowRecord[]>();
      axRows.forEach((r) => {
        const k = `${r.lot_no}::${r.plan_status}`;
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      });
      map.forEach((rs, k) => {
        const [lot, type] = k.split("::");
        out.push({
          annexure: a,
          lot_no: lot,
          type: type as PlanStatus,
          rows: rs,
          total: rs.reduce((s, r) => s + Number(r.total_qty || 0), 0),
          createdByLabel,
        });
      });
    });
    return out;
  }, [annexures, rows, profiles]);

  const filtered: FolderEntry[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      const status = (e.annexure.status as "active" | "cancelled" | undefined) || "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (fromDate && e.annexure.created_at < fromDate) return false;
      if (toDate && e.annexure.created_at > toDate + "T23:59:59") return false;
      if (createdByQ && !e.createdByLabel.toLowerCase().includes(createdByQ.trim().toLowerCase())) return false;
      if (needle) {
        const hay = [
          e.lot_no,
          TYPE_LABEL[e.type],
          status,
          e.createdByLabel,
          new Date(e.annexure.created_at).toLocaleString("en-IN"),
          ...e.rows.map((r) => `${r.material} ${r.size_model || ""} ${r.make || ""}`),
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, q, typeFilter, statusFilter, fromDate, toDate, createdByQ]);

  // Group filtered entries by lot
  const byLot = useMemo(() => {
    const m = new Map<string, FolderEntry[]>();
    filtered.forEach((e) => {
      if (!m.has(e.lot_no)) m.set(e.lot_no, []);
      m.get(e.lot_no)!.push(e);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  async function cancelAnnexure(a: AnnexureRecord) {
    if (!window.confirm(`Cancel annexure created on ${new Date(a.created_at).toLocaleString("en-IN")}? Related rows will be marked as Cancelled and freed for a new annexure.`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error: e1 } = await sb.from("requisition_annexures")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null })
      .eq("id", a.id);
    if (e1) { toast({ title: "Cancel failed", description: e1.message, variant: "destructive" }); return; }
    const { error: e2 } = await sb.from("requisition_raw_materials")
      .update({ annexure_status: null, annexure_id: null })
      .eq("annexure_id", a.id);
    if (e2) { toast({ title: "Status sync failed", description: e2.message, variant: "destructive" }); }
    setAnnexures((prev) => prev.map((x) => x.id === a.id
      ? { ...x, status: "cancelled" as const, cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null }
      : x));
    toast({ title: "Annexure cancelled" });
  }

  function labelFor(a: AnnexureRecord): string {
    const lots = a.lot_numbers?.join(", ") || "—";
    return `Lot ${lots} · ${new Date(a.created_at).toLocaleString("en-IN")}`;
  }

  async function deleteOne(a: AnnexureRecord) {
    setDeleting(true);
    try {
      await deleteAnnexureCascade(a.id);
      setAnnexures((prev) => prev.filter((x) => x.id !== a.id));
      setRows((prev) => prev.filter((r) => r.annexure_id !== a.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(a.id); return n; });
      toast({ title: "Annexure deleted", description: labelFor(a) });
      setConfirmDel(null);
    } catch (e) {
      const err = e as Error;
      toast({
        title: err instanceof AnnexureDeleteBlockedError ? "Cannot delete" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function runBulkDelete() {
    if (!bulkOpen) return;
    setDeleting(true);
    let ok = 0; let blocked = 0; let fail = 0; const errs: string[] = [];
    for (const id of bulkOpen.ids) {
      try { await deleteAnnexureCascade(id); ok++; }
      catch (e) {
        if (e instanceof AnnexureDeleteBlockedError) blocked++;
        else fail++;
        errs.push((e as Error).message);
      }
    }
    setDeleting(false);
    setBulkOpen(null);
    setSelected(new Set());
    await load();
    if (blocked === 0 && fail === 0) toast({ title: `Deleted ${ok} annexure${ok === 1 ? "" : "s"}` });
    else toast({
      title: `Deleted ${ok}, blocked ${blocked}, failed ${fail}`,
      description: errs.slice(0, 2).join("; "),
      variant: blocked + fail > 0 ? "destructive" : "default",
    });
  }

  // Distinct annexures in current filter (one annexure may produce multiple FolderEntries by type)
  const filteredAnnexures = useMemo(() => {
    const map = new Map<string, AnnexureRecord>();
    filtered.forEach((e) => { if (!map.has(e.annexure.id)) map.set(e.annexure.id, e.annexure); });
    return Array.from(map.values());
  }, [filtered]);

  function toggleOne(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function recreate(a: AnnexureRecord) {
    const ids = a.requisition_ids.join(",");
    const lots = a.lot_numbers.join(",");
    navigate(`/requisitions/plan?ids=${encodeURIComponent(ids)}&relotSelect=${encodeURIComponent(lots)}&tab=raw`);
  }

  function downloadPdf(e: FolderEntry) {
    const doc = new jsPDF({ orientation: "landscape" });
    const title = `${TYPE_LABEL[e.type]} — Lot ${e.lot_no}`;
    doc.setFontSize(14); doc.text(title, 14, 14);
    doc.setFontSize(10);
    doc.text(`Created: ${new Date(e.annexure.created_at).toLocaleString("en-IN")} · By: ${e.createdByLabel}`, 14, 22);
    const status = (e.annexure.status as string | undefined) || "active";
    doc.text(`Status: ${status.toUpperCase()}`, 14, 28);
    autoTable(doc, {
      startY: 34,
      head: [["Lot", "Raw Material", "Size", "RM Make", "UOM", "Total Qty"]],
      body: e.rows.map((r) => [r.lot_no, r.material, r.size_model || "—", r.make || "—", r.unit || "—", fmtQty2(r.total_qty)]),
      foot: [["", "", "", "", "Grand Total", fmtQty2(e.total)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 40, 40] },
    });
    doc.save(`${e.type}_${e.lot_no}_annexure.pdf`);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Annexure Folder</h1>
          <p className="text-xs text-muted-foreground mt-1">All created annexures, grouped by Lot.</p>
        </div>
        <Link to="/requisitions"><Button variant="outline" size="sm">Back to Requisitions</Button></Link>
      </div>

      {/* Search / filter bar */}
      <Card>
        <CardContent className="py-3 grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="h-8 pl-7" placeholder="Search lot / material / type / status / date / by"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ACTIVE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
              {entries.some((e) => e.type === "steel") && (
                <SelectItem value="steel">Steel List (legacy)</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Input className="h-8" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} placeholder="From" />
          <Input className="h-8" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} placeholder="To" />
          <Input className="h-8 md:col-span-2" placeholder="Created by (name/email)" value={createdByQ} onChange={(e) => setCreatedByQ(e.target.value)} />
          <div className="md:col-span-4 flex items-center text-muted-foreground">
            {filtered.length} of {entries.length} annexure entries
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] text-muted-foreground mr-auto">
            {selected.size > 0 ? `${selected.size} annexure(s) selected` : `${filteredAnnexures.length} annexure(s) shown`}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive"
            disabled={selected.size === 0}
            onClick={() => {
              const list = annexures.filter((a) => selected.has(a.id));
              setBulkOpen({ ids: list.map((a) => a.id), labels: list.map(labelFor) });
            }}
          >
            <Trash2 className="h-3 w-3 mr-1" />Delete Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] text-destructive"
            disabled={filteredAnnexures.length === 0}
            onClick={() => setBulkOpen({ ids: filteredAnnexures.map((a) => a.id), labels: filteredAnnexures.map(labelFor) })}
          >
            <Trash2 className="h-3 w-3 mr-1" />Delete All Filtered
          </Button>
        </div>
      )}

      {byLot.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No annexures match.</CardContent></Card>
      ) : byLot.map(([lot, list]) => (
        <Card key={lot}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Lot {lot} <span className="text-xs text-muted-foreground font-normal">— {list.length} annexure entr{list.length === 1 ? "y" : "ies"}</span></CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                <tr>
                  {isAdmin && <th className="text-left py-2 px-2 border-r w-8"></th>}
                  <th className="text-left py-2 px-2 border-r">Type</th>
                  <th className="text-left py-2 px-2 border-r">Created</th>
                  <th className="text-left py-2 px-2 border-r">Created By</th>
                  <th className="text-left py-2 px-2 border-r">Status</th>
                  <th className="text-right py-2 px-2 border-r">Rows</th>
                  <th className="text-right py-2 px-2 border-r">Grand Total</th>
                  <th className="text-left py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const status = (e.annexure.status as string | undefined) || "active";
                  const cancelled = status === "cancelled";
                  return (
                    <tr key={`${e.annexure.id}::${e.type}`} className={`border-b last:border-0 ${cancelled ? "opacity-60" : ""}`}>
                      {isAdmin && (
                        <td className="py-2 px-2 border-r">
                          <Checkbox checked={selected.has(e.annexure.id)} onCheckedChange={() => toggleOne(e.annexure.id)} />
                        </td>
                      )}
                      <td className="py-2 px-2 border-r font-medium">{TYPE_LABEL[e.type]}</td>
                      <td className="py-2 px-2 border-r">{new Date(e.annexure.created_at).toLocaleString("en-IN")}</td>
                      <td className="py-2 px-2 border-r text-xs">{e.createdByLabel}</td>
                      <td className="py-2 px-2 border-r">
                        {cancelled
                          ? <Badge variant="outline" className="text-[10px]">Annexure Cancelled</Badge>
                          : <Badge variant="secondary" className="text-[10px]">Annexure Created</Badge>}
                      </td>
                      <td className="py-2 px-2 border-r text-right">{e.rows.length}</td>
                      <td className="py-2 px-2 border-r text-right font-medium">{fmtQty2(e.total)}</td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => setViewEntry(e)}>
                            <Eye className="h-3 w-3 mr-1" />View
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => downloadPdf(e)}>
                            <Download className="h-3 w-3 mr-1" />PDF
                          </Button>
                          {!cancelled && (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => navigate(`/annexures/${e.annexure.id}/po/new?lot=${encodeURIComponent(e.lot_no)}&type=${e.type}`)}>
                              <ShoppingCart className="h-3 w-3 mr-1" />Generate PO
                            </Button>
                          )}
                          {cancelled ? (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => recreate(e.annexure)}>
                              <RotateCcw className="h-3 w-3 mr-1" />Recreate
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-destructive" onClick={() => cancelAnnexure(e.annexure)}>
                              <XCircle className="h-3 w-3 mr-1" />Cancel
                            </Button>
                          )}
                          {isAdmin && (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 text-destructive" onClick={() => setConfirmDel(e.annexure)}>
                              <Trash2 className="h-3 w-3 mr-1" />Delete
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
      ))}

      <Dialog open={!!viewEntry} onOpenChange={(o) => !o && setViewEntry(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {viewEntry && <>
                {TYPE_LABEL[viewEntry.type]} — Lot {viewEntry.lot_no}
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {new Date(viewEntry.annexure.created_at).toLocaleString("en-IN")} · {viewEntry.createdByLabel}
                </span>
              </>}
            </DialogTitle>
          </DialogHeader>
          {viewEntry && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left py-2 px-2 border-r">Lot</th>
                    <th className="text-left py-2 px-2 border-r">Raw Material</th>
                    <th className="text-left py-2 px-2 border-r">Size</th>
                    <th className="text-left py-2 px-2 border-r">RM Make</th>
                    <th className="text-left py-2 px-2 border-r">UOM</th>
                    <th className="text-right py-2 px-2">Total Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {viewEntry.rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 px-2 border-r">{r.lot_no}</td>
                      <td className="py-2 px-2 border-r">{r.material}</td>
                      <td className="py-2 px-2 border-r">{r.size_model || "—"}</td>
                      <td className="py-2 px-2 border-r">{r.make || "—"}</td>
                      <td className="py-2 px-2 border-r">{r.unit || "—"}</td>
                      <td className="py-2 px-2 text-right">{fmtQty2(r.total_qty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-medium">
                    <td colSpan={5} className="py-2 px-2 text-right border-r">Grand Total</td>
                    <td className="py-2 px-2 text-right">{fmtQty2(viewEntry.total)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => downloadPdf(viewEntry)}>
                  <FileText className="h-4 w-4 mr-1" />Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => { if (!o && !deleting) setConfirmDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete annexure?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && <>This permanently removes the annexure ({labelFor(confirmDel)}) and its rows. Linked raw materials will be released for re-planning. Active POs referencing this annexure will block the delete.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(ev) => { ev.preventDefault(); if (confirmDel) deleteOne(confirmDel); }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmBulkDeleteDialog
        open={!!bulkOpen}
        onOpenChange={(o) => { if (!o) setBulkOpen(null); }}
        title="Delete annexures?"
        description="Each annexure and its rows will be permanently removed. Linked raw materials will be released. Annexures referenced by active POs will be skipped."
        items={bulkOpen?.labels || []}
        busy={deleting}
        onConfirm={runBulkDelete}
      />
    </div>
  );
}
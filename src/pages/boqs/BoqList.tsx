import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NoSharedDocsHint } from "@/components/access/NoSharedDocsHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, FilePlus2, Search, Pencil, Download, Trash2, Printer, FileSpreadsheet, History, GitCompare } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BoqRecord } from "@/lib/boq/types";
import { generateBoqPDF } from "@/lib/boq/pdf";
import { buildBoqXlsx } from "@/lib/boq/excel";
import { BoqCompareDialog } from "@/components/boqs/BoqCompareDialog";
import { NotSeenNotifBadge } from "@/components/notifications/NotSeenNotifBadge";

type OaOption = {
  id: string;
  oa_number: string;
  format: "MR" | "GMS";
  order_date: string;
  boq_status: "finalized" | "draft" | "none";
};

export default function BoqList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = (searchParams.get("folder") || "all").toLowerCase();
  const folder: "all" | "MR" | "GMS" =
    folderParam === "mr" ? "MR" : folderParam === "gms" ? "GMS" : "all";
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [oas, setOas] = useState<OaOption[]>([]);
  const [oaSearch, setOaSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Map: order family root id -> list of all BOQ rows for that family (any rev).
  const [familyBoqs, setFamilyBoqs] = useState<Record<string, BoqRecord[]>>({});
  const [openFamily, setOpenFamily] = useState<Record<string, boolean>>({});
  const [loadingFamily, setLoadingFamily] = useState<Record<string, boolean>>({});
  const [compare, setCompare] = useState<{ from: BoqRecord; to: BoqRecord } | null>(null);

  const counts = useMemo(() => {
    let mr = 0, gms = 0;
    for (const r of rows) {
      if (r.format === "MR") mr++;
      else if (r.format === "GMS") gms++;
    }
    return { all: rows.length, MR: mr, GMS: gms };
  }, [rows]);

  const visibleRows = useMemo(
    () => (folder === "all" ? rows : rows.filter((r) => r.format === folder)),
    [rows, folder],
  );

  function setFolder(next: "all" | "MR" | "GMS") {
    const sp = new URLSearchParams(searchParams);
    if (next === "all") sp.delete("folder");
    else sp.set("folder", next);
    setSearchParams(sp, { replace: true });
  }

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("boqs").select("*").order("created_at", { ascending: false });
      if (error) {
        toast({ title: "Failed to load BOQs", description: error.message, variant: "destructive" });
        setLoading(false); return;
      }
      const all = ((data || []) as unknown as BoqRecord[]);
      if (showSuperseded) { setRows(all); setLoading(false); return; }
      // Collapse to ONE row per OA family, keeping the latest revision.
      // Older revisions remain available via the expandable revision-history
      // panel already rendered below each row.
      const orderIds = Array.from(new Set(all.map((b) => b.order_id).filter(Boolean))) as string[];
      let rootById = new Map<string, string>();
      if (orderIds.length) {
        const { data: ords } = await supabase
          .from("orders").select("id,parent_order_id").in("id", orderIds);
        rootById = new Map(
          ((ords || []) as Array<{ id: string; parent_order_id: string | null }>)
            .map((o) => [o.id, o.parent_order_id || o.id]),
        );
      }
      const byFamily = new Map<string, BoqRecord>();
      for (const b of all) {
        const fam = rootById.get(b.order_id) || b.order_id || b.id;
        const ex = byFamily.get(fam);
        // Prefer higher revision; on tie, prefer the newer created_at.
        const better = !ex
          || (b.revision ?? 0) > (ex.revision ?? 0)
          || ((b.revision ?? 0) === (ex.revision ?? 0)
              && (b.created_at || "") > (ex.created_at || ""));
        if (better) byFamily.set(fam, b);
      }
      const latest = Array.from(byFamily.values())
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setRows(latest);
      setLoading(false);
    })();
  }, [showSuperseded, refreshTick]);

  /** Lazy-load every BOQ revision tied to the same OA family as `b`. */
  async function loadFamilyFor(b: BoqRecord) {
    setLoadingFamily((s) => ({ ...s, [b.id]: true }));
    try {
      // Find the OA family for this BOQ.
      const { data: oaRow } = await supabase
        .from("orders").select("id,parent_order_id").eq("id", b.order_id).maybeSingle();
      const root = (oaRow as { parent_order_id?: string | null; id?: string } | null)?.parent_order_id
        || (oaRow as { id?: string } | null)?.id
        || b.order_id;
      const { data: famRows } = await supabase
        .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
      const ids = Array.from(new Set([
        b.order_id, root,
        ...(((famRows || []) as Array<{ id: string }>).map((r) => r.id)),
      ].filter(Boolean)));
      const { data: boqs } = await supabase
        .from("boqs").select("*").in("order_id", ids).order("revision", { ascending: true });
      setFamilyBoqs((s) => ({ ...s, [b.id]: (boqs as unknown as BoqRecord[]) || [] }));
    } catch (e) {
      toast({ title: "Failed to load revisions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoadingFamily((s) => ({ ...s, [b.id]: false }));
    }
  }

  function toggleFamily(b: BoqRecord) {
    const willOpen = !openFamily[b.id];
    setOpenFamily((s) => ({ ...s, [b.id]: willOpen }));
    if (willOpen && !familyBoqs[b.id]) loadFamilyFor(b);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("boqs").delete().eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Deleted ${confirmDelete.label}` });
    setConfirmDelete(null);
    setRefreshTick((t) => t + 1);
  }

  // Load current OAs + which already have a current BOQ, for the dropdown.
  useEffect(() => {
    (async () => {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, oa_number, format, order_date, is_current")
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      const { data: existing } = await supabase
        .from("boqs")
        .select("order_id, status, is_current")
        .eq("is_current", true);
      const statusByOrder = new Map<string, "finalized" | "draft">();
      (existing || []).forEach((b: any) => {
        // Prefer finalized over draft if both somehow exist for the same OA.
        const prev = statusByOrder.get(b.order_id);
        if (prev === "finalized") return;
        statusByOrder.set(b.order_id, b.status === "finalized" ? "finalized" : "draft");
      });
      setOas(
        ((ords as any[]) || []).map((o) => ({
          id: o.id,
          oa_number: o.oa_number,
          format: o.format,
          order_date: o.order_date,
          boq_status: statusByOrder.get(o.id) ?? "none",
        }))
      );
    })();
  }, [rows]);

  const filteredOas = oas.filter((o) =>
    o.oa_number.toLowerCase().includes(oaSearch.trim().toLowerCase()) &&
    (folder === "all" || o.format === folder)
  );

  async function handleDownload(b: BoqRecord) {
    try {
      const doc = await generateBoqPDF(b, { showApproval: true });
      const safe = (b.boq_number || "BOQ").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
      toast({ title: "BOQ PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function handlePrint(b: BoqRecord) {
    try {
      const doc = await generateBoqPDF(b, { showApproval: true });
      const blobUrl = doc.output("bloburl") as unknown as string;
      const w = window.open(blobUrl, "_blank", "noopener");
      if (w) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 1000);
    } catch (e: any) {
      toast({ title: "Print failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  function handleExcel(b: BoqRecord) {
    try {
      const blob = buildBoqXlsx(b);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (b.boq_number || "BOQ").replace(/[/\\]/g, "_");
      a.href = url; a.download = `${safe}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e: any) {
      toast({ title: "Excel export failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">BOQ Folder</h1>
            <p className="text-sm text-muted-foreground mt-1">Bill-of-quantities documents generated from your orders.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg">
              <Link to="/orders">Go to Orders</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-lg">
                  <FilePlus2 className="mr-1.5 h-4 w-4" />
                  Create BOQ
                  <ChevronDown className="ml-1.5 h-4 w-4 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[340px]">
                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                  Pick an OA to generate from
                </DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={oaSearch}
                      onChange={(e) => setOaSearch(e.target.value)}
                      placeholder="Search OA number…"
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-72 overflow-y-auto">
                  {filteredOas.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {oas.length === 0 ? "No OAs available yet." : "No OAs match your search."}
                    </div>
                  ) : (
                    filteredOas.map((o) => (
                      <DropdownMenuItem
                        key={o.id}
                        onSelect={() => nav(`/boqs/new?orderId=${o.id}`)}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-medium truncate">{o.oa_number}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(o.order_date).toLocaleDateString("en-IN")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={o.format === "MR" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
                            {o.format}
                          </Badge>
                          {o.boq_status === "finalized" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              Final
                            </span>
                          ) : o.boq_status === "draft" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Draft
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                              None
                            </span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {folder === "all" ? "All BOQs" : `${folder} BOQ Folder`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="boq-show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="boq-show-superseded" className="cursor-pointer">Show superseded revisions</Label>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={folder} onValueChange={(v) => setFolder(v as "all" | "MR" | "GMS")} className="mb-4">
              <TabsList>
                <TabsTrigger value="all">All <span className="ml-1.5 text-[10px] opacity-70">{counts.all}</span></TabsTrigger>
                <TabsTrigger value="MR">MR Folder <span className="ml-1.5 text-[10px] opacity-70">{counts.MR}</span></TabsTrigger>
                <TabsTrigger value="GMS">GMS Folder <span className="ml-1.5 text-[10px] opacity-70">{counts.GMS}</span></TabsTrigger>
              </TabsList>
            </Tabs>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              visibleRows.length === 0 ? (
                <div>
                  <p className="text-muted-foreground">
                    {rows.length === 0
                      ? <>No BOQs yet. Open an Order and click <span className="font-medium">Generate BOQ</span>.</>
                      : `No ${folder} BOQs in this folder yet.`}
                  </p>
                  <NoSharedDocsHint />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8" />
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">BOQ No.</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Rev</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Reference OA</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Not Seen Notifications</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((b) => (
                      <Fragment key={b.id}>
                       <TableRow className="cursor-pointer hover:bg-accent/40" onClick={() => nav(`/boqs/${b.id}`)}>
                         <TableCell className="w-8 p-1" onClick={(e) => { e.stopPropagation(); toggleFamily(b); }}>
                           <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Show all revisions">
                             {openFamily[b.id]
                               ? <ChevronDown className="h-4 w-4" />
                               : <ChevronRight className="h-4 w-4" />}
                           </Button>
                         </TableCell>
                         <TableCell className="font-mono font-medium">
                           {(() => {
                             const base = (b.boq_number || "").replace(/\/R\d+$/i, "");
                             const rev = b.revision ?? 0;
                             return rev > 0 ? `${base}/R${rev}` : base;
                           })()}
                         </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-muted">R{b.revision ?? 0}</span>
                            {b.verification_status === "pending_verification"
                              ? <Badge variant="outline" className="text-[9px] uppercase border-amber-500/50 text-amber-700 dark:text-amber-400">Pending</Badge>
                              : b.verification_status === "rejected"
                              ? <Badge variant="destructive" className="text-[9px] uppercase">Rejected</Badge>
                              : b.is_current
                              ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                              : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant={b.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{b.format}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{b.reference_oa_number || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(b.boq_date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${b.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                            {b.status}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <NotSeenNotifBadge variant="cell" boqId={b.id} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => nav(`/boqs/${b.id}`)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleDownload(b)}>
                              <Download className="h-3.5 w-3.5 mr-1" />PDF
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleExcel(b)} title="Download Excel">
                              <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handlePrint(b)} title="Print">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: b.id, label: b.boq_number }); }}
                              aria-label={`Delete ${b.boq_number}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                       {openFamily[b.id] && (
                         <TableRow className="bg-muted/20 hover:bg-muted/20">
                           <TableCell colSpan={9} className="p-0">
                             <div className="px-4 py-3">
                               <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                                 <History className="h-3.5 w-3.5" />
                                 BOQ Revision History
                               </div>
                               {loadingFamily[b.id] ? (
                                 <div className="text-xs text-muted-foreground py-2">Loading revisions…</div>
                               ) : (familyBoqs[b.id] || []).length === 0 ? (
                                 <div className="text-xs text-muted-foreground py-2">No revisions found.</div>
                               ) : (
                                 <div className="space-y-1">
                                   {(familyBoqs[b.id] || []).map((rev) => {
                                     const r = rev.revision ?? 0;
                                     const label = r === 0 ? "BOQ Original" : `BOQ R${r}`;
                                     const current = (familyBoqs[b.id] || []).find((x) => x.is_current) || null;
                                     const canCompare = !!current && current.id !== rev.id;
                                     return (
                                       <div key={rev.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 ${rev.is_current ? "border-primary/40" : ""}`}>
                                         <div className="flex items-center gap-2 flex-wrap min-w-0">
                                           <Badge variant={rev.is_current ? "default" : "outline"} className="text-[10px] uppercase">
                                             {label}
                                           </Badge>
                                           <span className="font-mono text-xs font-semibold truncate">{rev.boq_number}</span>
                                           <Badge variant={rev.format === "MR" ? "default" : "secondary"} className="text-[9px]">{rev.format}</Badge>
                                           <span className="text-[11px] text-muted-foreground">· {new Date(rev.boq_date).toLocaleDateString("en-IN")}</span>
                                           {rev.prepared_by && <span className="text-[11px] text-muted-foreground">· by {rev.prepared_by}</span>}
                                           {rev.is_current
                                             ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                                             : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                                         </div>
                                         <div className="flex items-center gap-1">
                                           <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => nav(`/boqs/${rev.id}`)}>
                                             <Pencil className="h-3.5 w-3.5 mr-1" />View
                                           </Button>
                                           {canCompare && (
                                             <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setCompare({ from: rev, to: current! })} title="Compare with current revision">
                                               <GitCompare className="h-3.5 w-3.5 mr-1" />Compare
                                             </Button>
                                           )}
                                           <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handlePrint(rev)} title="Print">
                                             <Printer className="h-3.5 w-3.5 mr-1" />Print
                                           </Button>
                                           <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleDownload(rev)} title="Download PDF">
                                             <Download className="h-3.5 w-3.5 mr-1" />PDF
                                           </Button>
                                           <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleExcel(rev)} title="Download Excel">
                                             <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Excel
                                           </Button>
                                         </div>
                                       </div>
                                     );
                                   })}
                                 </div>
                               )}
                             </div>
                           </TableCell>
                         </TableRow>
                       )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOQ?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono font-semibold">{confirmDelete?.label}</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-1 h-4 w-4" />Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BoqCompareDialog
        open={!!compare}
        onOpenChange={(o) => { if (!o) setCompare(null); }}
        from={compare?.from || null}
        to={compare?.to || null}
      />
    </div>
  );
}
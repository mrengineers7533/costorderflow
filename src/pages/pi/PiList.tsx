import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NoSharedDocsHint } from "@/components/access/NoSharedDocsHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, FilePlus2, Search, Pencil, Download, Eye, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PiRecord } from "@/lib/pi/types";
import { generatePiPDF } from "@/lib/pi/pdf";
import { buildPiXlsx } from "@/lib/pi/excel";
import type { OrderRecord } from "@/lib/orders/types";
import { PiItemSelectDialog } from "@/components/pi/PiItemSelectDialog";
import { NotSeenNotifBadge } from "@/components/notifications/NotSeenNotifBadge";
import { inspectDelete, EMPTY_IMPACT, type DeleteImpact } from "@/lib/delete/guards";

type OaOption = { id: string; oa_number: string; format: "MR" | "GMS"; order_date: string; pi_count: number };

export default function PiList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = (searchParams.get("folder") || "all").toLowerCase();
  const folder: "all" | "MR" | "GMS" =
    folderParam === "mr" ? "MR" : folderParam === "gms" ? "GMS" : "all";
  const [rows, setRows] = useState<PiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [oas, setOas] = useState<OaOption[]>([]);
  const [oaSearch, setOaSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ pi: PiRecord; isRoot: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [impact, setImpact] = useState<DeleteImpact>(EMPTY_IMPACT);
  const [refreshTick, setRefreshTick] = useState(0);
  const [piDialogOpen, setPiDialogOpen] = useState(false);
  const [piDialogOa, setPiDialogOa] = useState<OrderRecord | null>(null);

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
    let q = supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false });
    if (!showSuperseded) q = q.eq("is_current", true);
    q.then(({ data, error }) => {
      if (error) toast({ title: "Failed to load PIs", description: error.message, variant: "destructive" });
      else setRows(((data as unknown) as PiRecord[]) || []);
      setLoading(false);
    });
  }, [showSuperseded, refreshTick]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { pi, isRoot } = confirmDelete;
    let error;
    if (isRoot) {
      // Delete entire revision family: this row + any children pointing at it.
      const { error: e1 } = await supabase
        .from("proforma_invoices")
        .delete()
        .or(`id.eq.${pi.id},parent_pi_id.eq.${pi.id}`);
      error = e1;
    } else {
      const { error: e2 } = await supabase.from("proforma_invoices").delete().eq("id", pi.id);
      error = e2;
    }
    setDeleting(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Deleted ${pi.pi_number}${isRoot ? " (and revisions)" : ""}` });
    setConfirmDelete(null);
    setRefreshTick((t) => t + 1);
  }

  useEffect(() => {
    (async () => {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, oa_number, format, order_date")
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      const { data: existingPis } = await supabase
        .from("proforma_invoices")
        .select("reference_oa_id")
        .eq("is_current", true);
      const counts = new Map<string, number>();
      (existingPis || []).forEach((p: any) => {
        if (!p.reference_oa_id) return;
        counts.set(p.reference_oa_id, (counts.get(p.reference_oa_id) || 0) + 1);
      });
      setOas(((ords as any[]) || []).map((o) => ({
        id: o.id, oa_number: o.oa_number, format: o.format,
        order_date: o.order_date, pi_count: counts.get(o.id) || 0,
      })));
    })();
  }, [rows]);

  const filteredOas = oas.filter((o) =>
    o.oa_number.toLowerCase().includes(oaSearch.trim().toLowerCase()) &&
    (folder === "all" || o.format === folder)
  );

  async function handleConvert(oaId: string) {
    try {
      const { data: oa, error } = await supabase.from("orders").select("*").eq("id", oaId).maybeSingle();
      if (error || !oa) throw error || new Error("OA not found");
      setPiDialogOa(oa as unknown as OrderRecord);
      setPiDialogOpen(true);
    } catch (e: any) {
      toast({ title: "Failed to open PI dialog", description: e?.message || String(e), variant: "destructive" });
    }
  }

  async function handleDownload(p: PiRecord) {
    try {
      const doc = await generatePiPDF(p);
      const safe = (p.pi_number || "PI").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
      toast({ title: "PI PDF downloaded" });
    } catch (e: any) {
      toast({ title: "Download failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  function handleDownloadXlsx(p: PiRecord) {
    try {
      const blob = buildPiXlsx(p);
      const safe = (p.pi_number || "PI").replace(/[/\\]/g, "_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "PI Excel downloaded" });
    } catch (e: any) {
      toast({ title: "Excel download failed", description: e?.message || String(e), variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Proforma Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">All PI documents grouped by OA. Originals and revisions kept side-by-side.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="rounded-lg">
                <FilePlus2 className="mr-1.5 h-4 w-4" />
                Create PI from OA
                <ChevronDown className="ml-1.5 h-4 w-4 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[340px]">
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                Pick an OA to convert
              </DropdownMenuLabel>
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={oaSearch} onChange={(e) => setOaSearch(e.target.value)} placeholder="Search OA number…" className="h-8 pl-7 text-sm" />
                </div>
              </div>
              <DropdownMenuSeparator />
              <div className="max-h-72 overflow-y-auto">
                {filteredOas.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {oas.length === 0 ? "No OAs available yet." : "No OAs match your search."}
                  </div>
                ) : filteredOas.map((o) => (
                  <DropdownMenuItem key={o.id} onSelect={() => handleConvert(o.id)} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium truncate">{o.oa_number}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(o.order_date).toLocaleDateString("en-IN")}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={o.format === "MR" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">{o.format}</Badge>
                      {o.pi_count > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
                          {o.pi_count} PI
                        </span>
                      ) : null}
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {folder === "all" ? "All Proforma Invoices" : `${folder} PI Folder`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="pi-show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="pi-show-superseded" className="cursor-pointer">Show superseded revisions</Label>
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
                      ? <>No PIs yet. Click <span className="font-medium">Create PI from OA</span>.</>
                      : `No ${folder} PIs in this folder yet.`}
                  </p>
                  <NoSharedDocsHint />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">PI No.</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Rev</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Ref OA</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Net Payable</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Not Seen Notifications</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-accent/40" onClick={() => nav(`/pi/${p.id}`)}>
                        <TableCell className="font-mono font-medium">{p.pi_number}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-muted">R{p.revision ?? 0}</span>
                            {p.is_current
                              ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                              : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant={p.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{p.format}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{p.reference_oa_number || "-"}</TableCell>
                        <TableCell>{p.company_name || p.bill_to?.name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(p.pi_date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">₹ {(p.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${p.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                            {p.status}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <NotSeenNotifBadge variant="cell" piId={p.id} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => nav(`/pi/${p.id}`)}>
                              <Eye className="h-3.5 w-3.5 mr-1" />View
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => nav(`/pi/${p.id}`)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleDownload(p)}>
                              <Download className="h-3.5 w-3.5 mr-1" />PDF
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => handleDownloadXlsx(p)}>
                              <Download className="h-3.5 w-3.5 mr-1" />Excel
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ pi: p, isRoot: !p.parent_pi_id }); }}
                              aria-label={`Delete ${p.pi_number}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
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
            <AlertDialogTitle>Delete Proforma Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono font-semibold">{confirmDelete?.pi.pi_number}</span>
              {confirmDelete?.isRoot
                ? " along with all of its revisions."
                : " (this single revision only)."}
              {" "}This action cannot be undone.
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

      <PiItemSelectDialog
        open={piDialogOpen}
        onOpenChange={setPiDialogOpen}
        oa={piDialogOa}
        onCreated={() => setRefreshTick((t) => t + 1)}
      />
    </div>
  );
}
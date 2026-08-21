import { useEffect, useMemo, useState } from "react";
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
import { toast } from "@/hooks/use-toast";
import { Upload, FilePlus2, Sparkles, ArrowRight, Pencil, Trash2, Download, ClipboardList, Receipt, Printer, FileSpreadsheet } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { OrderRecord } from "@/lib/orders/types";
import { generateOrderPDF } from "@/lib/orders/pdf";
import { exportOrderPreviewPdf } from "@/lib/orders/previewExport";
import { buildOrderXlsx } from "@/lib/orders/excel";
import { NotSeenNotifBadge } from "@/components/notifications/NotSeenNotifBadge";
import { inspectDelete, EMPTY_IMPACT, type DeleteImpact } from "@/lib/delete/guards";

export default function OrdersList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = (searchParams.get("folder") || "all").toLowerCase();
  const folder: "all" | "MR" | "GMS" =
    folderParam === "mr" ? "MR" : folderParam === "gms" ? "GMS" : "all";
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ order: OrderRecord; isRoot: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [impact, setImpact] = useState<DeleteImpact>(EMPTY_IMPACT);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!confirmDelete) { setImpact(EMPTY_IMPACT); return; }
    let alive = true;
    setImpact({ ...EMPTY_IMPACT, loading: true });
    inspectDelete("order", confirmDelete.order.id, confirmDelete.isRoot).then((r) => {
      if (alive) setImpact(r);
    });
    return () => { alive = false; };
  }, [confirmDelete]);
  const [boqCounts, setBoqCounts] = useState<Record<string, number>>({});
  const [piCounts, setPiCounts] = useState<Record<string, number>>({});

  const counts = useMemo(() => {
    let mr = 0, gms = 0;
    for (const o of orders) {
      if (o.format === "MR") mr++;
      else if (o.format === "GMS") gms++;
    }
    return { all: orders.length, MR: mr, GMS: gms };
  }, [orders]);

  const visibleOrders = useMemo(
    () => (folder === "all" ? orders : orders.filter((o) => o.format === folder)),
    [orders, folder],
  );

  function setFolder(next: "all" | "MR" | "GMS") {
    const sp = new URLSearchParams(searchParams);
    if (next === "all") sp.delete("folder");
    else sp.set("folder", next);
    setSearchParams(sp, { replace: true });
  }

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (!showSuperseded) q = q.eq("is_current", true);
    q.then(({ data, error }) => {
      if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      else setOrders((data as unknown as OrderRecord[]) || []);
      setLoading(false);
    });
  }, [showSuperseded, refreshTick]);

  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) {
      setBoqCounts({});
      setPiCounts({});
      return;
    }
    (async () => {
      const [boqRes, piRes] = await Promise.all([
        supabase.from("boqs").select("order_id").in("order_id", ids),
        supabase.from("proforma_invoices").select("reference_oa_id").in("reference_oa_id", ids),
      ]);
      const bMap: Record<string, number> = {};
      ((boqRes.data as { order_id: string }[]) || []).forEach((r) => {
        if (r.order_id) bMap[r.order_id] = (bMap[r.order_id] || 0) + 1;
      });
      const pMap: Record<string, number> = {};
      ((piRes.data as { reference_oa_id: string }[]) || []).forEach((r) => {
        if (r.reference_oa_id) pMap[r.reference_oa_id] = (pMap[r.reference_oa_id] || 0) + 1;
      });
      setBoqCounts(bMap);
      setPiCounts(pMap);
    })();
  }, [orders]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { order, isRoot } = confirmDelete;
    let error;
    if (isRoot) {
      const { error: e1 } = await supabase
        .from("orders")
        .delete()
        .or(`id.eq.${order.id},parent_order_id.eq.${order.id}`);
      error = e1;
    } else {
      const { error: e2 } = await supabase.from("orders").delete().eq("id", order.id);
      error = e2;
    }
    setDeleting(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Deleted ${order.oa_number}${isRoot ? " (and revisions)" : ""}` });
    setConfirmDelete(null);
    setRefreshTick((t) => t + 1);
  }

  async function downloadOrderPdf(o: OrderRecord) {
    try {
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      const captured = await exportOrderPreviewPdf(o, `${safe}.pdf`);
      if (!captured.ok) {
        const doc = await generateOrderPDF(o);
        doc.save(`${safe}.pdf`);
      }
      toast({ title: "OA PDF downloaded", description: o.oa_number });
    } catch (err) {
      toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  async function printOrderPdf(o: OrderRecord) {
    try {
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      const captured = await exportOrderPreviewPdf(o, `${safe}.pdf`, { save: false });
      const blobUrl = captured.ok
        ? URL.createObjectURL(captured.blob)
        : (await generateOrderPDF(o)).output("bloburl") as unknown as string;
      const w = window.open(blobUrl, "_blank", "noopener");
      if (w) setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 1000);
    } catch (err) {
      toast({ title: "Print failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  function downloadOrderXlsx(o: OrderRecord) {
    try {
      const blob = buildOrderXlsx(o);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      a.href = url; a.download = `${safe}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      toast({ title: "Excel export failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Order Acceptances</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse and manage all your OAs.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <NewOaCard
            to="/orders/new"
            icon={<Upload className="h-5 w-5" />}
            title="Upload Cost Sheet"
            description="Drop a cost sheet PDF — we'll extract company, items and charges to pre-fill the OA."
            cta="Upload PDF"
            badge={
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                <Sparkles className="h-3 w-3" />AI Powered
              </span>
            }
          />
          <NewOaCard
            to="/orders/new/edit"
            icon={<FilePlus2 className="h-5 w-5" />}
            title="Create Blank Manually"
            description="Start with an empty form and enter all order details by hand."
            cta="Start blank"
          />
        </div>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {folder === "all" ? "All Orders" : `${folder} Folder`}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="show-superseded" className="cursor-pointer">Show superseded revisions</Label>
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
              visibleOrders.length === 0 ? (
                <div>
                  <p className="text-muted-foreground">
                    {orders.length === 0
                      ? "No orders yet. Upload a cost sheet to get started."
                      : `No ${folder === "all" ? "" : folder + " "}OAs in this folder yet.`}
                  </p>
                  <NoSharedDocsHint />
                </div>
              ) :
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">OA Number</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Rev</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Company</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Net Payable</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">BOQ</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">PI</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Not Seen Notifications</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrders.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/orders/${o.id}`)}>
                      <TableCell className="font-mono font-medium">
                        {(() => {
                          const base = (o.oa_number || "").replace(/\/R\d+$/i, "");
                          const rev = o.revision ?? 0;
                          return rev > 0 ? `${base}/R${rev}` : base;
                        })()}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-muted">R{o.revision ?? 0}</span>
                          {o.is_current
                            ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                            : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{o.format}</Badge>
                      </TableCell>
                      <TableCell>{o.company_name || o.bill_to?.name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${o.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                          {o.status}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <BoqBadge count={boqCounts[o.id] || 0} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <PiBadge count={piCounts[o.id] || 0} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <NotSeenNotifBadge variant="cell" orderRootId={o.parent_order_id ?? o.id} />
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate(`/orders/${o.id}`)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={(e) => { e.stopPropagation(); downloadOrderPdf(o); }}
                            aria-label={`Download ${o.oa_number}`}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={(e) => { e.stopPropagation(); downloadOrderXlsx(o); }}
                            aria-label={`Excel ${o.oa_number}`}
                            title="Download Excel"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={(e) => { e.stopPropagation(); printOrderPdf(o); }}
                            aria-label={`Print ${o.oa_number}`}
                            title="Print"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete({ order: o, isRoot: !o.parent_order_id }); }}
                            aria-label={`Delete ${o.oa_number}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order Acceptance?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono font-semibold">{confirmDelete?.order.oa_number}</span>
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
    </div>
  );
}

function NewOaCard({
  to, onClick, icon, title, description, cta, badge,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  badge?: React.ReactNode;
}) {
  const inner = (
    <Card className="h-full rounded-xl border-border/70 shadow-sm transition-all hover:border-primary/40 hover:shadow-md cursor-pointer">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {badge}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
          {cta}<ArrowRight className="h-3.5 w-3.5" />
        </span>
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to} className="block h-full group">{inner}</Link>;
  return <button type="button" onClick={onClick} className="block h-full text-left w-full group">{inner}</button>;
}

function BoqBadge({ count }: { count: number }) {
  if (!count) return <span className="text-muted-foreground/50 text-xs">—</span>;
  return (
    <Link
      to="/boqs"
      title={`${count} BOQ${count > 1 ? " revisions" : ""} created`}
      className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[10px] font-semibold hover:bg-secondary/80 transition-colors"
    >
      <ClipboardList className="h-3 w-3" />
      BOQ{count > 1 ? ` ×${count}` : ""}
    </Link>
  );
}

function PiBadge({ count }: { count: number }) {
  if (!count) return <span className="text-muted-foreground/50 text-xs">—</span>;
  return (
    <Link
      to="/pi"
      title={`${count} PI${count > 1 ? " revisions" : ""} created`}
      className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold hover:bg-primary/80 transition-colors"
    >
      <Receipt className="h-3 w-3" />
      PI{count > 1 ? ` ×${count}` : ""}
    </Link>
  );
}

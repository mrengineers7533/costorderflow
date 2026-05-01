import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Upload, FilePlus2, Sparkles, ArrowRight, Pencil, Trash2, Download, ClipboardList, Receipt, Plus, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PiItemSelectDialog } from "@/components/pi/PiItemSelectDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { OrderRecord } from "@/lib/orders/types";
import { generateOrderPDF } from "@/lib/orders/pdf";

export default function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ order: OrderRecord; isRoot: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [boqCounts, setBoqCounts] = useState<Record<string, number>>({});
  const [piCounts, setPiCounts] = useState<Record<string, number>>({});
  const [docFilter, setDocFilter] = useState<"all" | "boq" | "pi" | "none">("all");
  const [piDialogOpen, setPiDialogOpen] = useState(false);
  const [piDialogOa, setPiDialogOa] = useState<OrderRecord | null>(null);

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
  }, [orders, refreshTick]);

  const counts = {
    all: orders.length,
    boq: orders.filter((o) => (boqCounts[o.id] || 0) > 0).length,
    pi: orders.filter((o) => (piCounts[o.id] || 0) > 0).length,
    none: orders.filter((o) => !(boqCounts[o.id] || 0) && !(piCounts[o.id] || 0)).length,
  };

  const visibleOrders = orders.filter((o) => {
    const b = boqCounts[o.id] || 0;
    const p = piCounts[o.id] || 0;
    if (docFilter === "boq") return b > 0;
    if (docFilter === "pi") return p > 0;
    if (docFilter === "none") return !b && !p;
    return true;
  });

  function openCreatePi(o: OrderRecord) {
    setPiDialogOa(o);
    setPiDialogOpen(true);
  }

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
      const doc = await generateOrderPDF(o);
      const safe = (o.oa_number || "OA").replace(/[/\\]/g, "_");
      doc.save(`${safe}.pdf`);
      toast({ title: "OA PDF downloaded", description: o.oa_number });
    } catch (err) {
      toast({ title: "Download failed", description: (err as Error).message, variant: "destructive" });
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
            <CardTitle className="text-base font-semibold">All Orders</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="show-superseded" className="cursor-pointer">Show superseded revisions</Label>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              orders.length === 0 ? <p className="text-muted-foreground">No orders yet. Click “New Order” to create one.</p> :
              <>
              <Tabs value={docFilter} onValueChange={(v) => setDocFilter(v as typeof docFilter)} className="mb-4">
                <TabsList>
                  <TabsTrigger value="all">All <span className="ml-1.5 text-[10px] opacity-70">{counts.all}</span></TabsTrigger>
                  <TabsTrigger value="boq">Has BOQ <span className="ml-1.5 text-[10px] opacity-70">{counts.boq}</span></TabsTrigger>
                  <TabsTrigger value="pi">Has PI <span className="ml-1.5 text-[10px] opacity-70">{counts.pi}</span></TabsTrigger>
                  <TabsTrigger value="none">No Docs <span className="ml-1.5 text-[10px] opacity-70">{counts.none}</span></TabsTrigger>
                </TabsList>
              </Tabs>
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
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No orders match this filter.</TableCell></TableRow>
                  ) : visibleOrders.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/orders/${o.id}`)}>
                      <TableCell className="font-mono font-medium">{o.oa_number}</TableCell>
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
                        <BoqCell orderId={o.id} count={boqCounts[o.id] || 0} onCreate={() => navigate(`/boqs/new?orderId=${o.id}`)} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <PiCell count={piCounts[o.id] || 0} onCreate={() => openCreatePi(o)} onView={() => navigate("/pi")} />
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
              </>
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

      <PiItemSelectDialog
        open={piDialogOpen}
        onOpenChange={setPiDialogOpen}
        oa={piDialogOa}
        onCreated={() => setRefreshTick((t) => t + 1)}
      />
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

function BoqCell({ orderId, count, onCreate }: { orderId: string; count: number; onCreate: () => void }) {
  if (count === 0) {
    return (
      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onCreate}>
        <Plus className="h-3 w-3 mr-1" />Create BOQ
      </Button>
    );
  }
  return (
    <Link
      to="/boqs"
      title={`${count} BOQ${count > 1 ? " revisions" : ""} created`}
      className="inline-flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-[11px] font-medium hover:bg-secondary/80 transition-colors"
    >
      <Eye className="h-3 w-3" />
      <ClipboardList className="h-3 w-3" />
      View BOQ{count > 1 ? ` ×${count}` : ""}
    </Link>
  );
}

function PiCell({ count, onCreate, onView }: { count: number; onCreate: () => void; onView: () => void }) {
  if (count === 0) {
    return (
      <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onCreate}>
        <Plus className="h-3 w-3 mr-1" />Create PI
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={onView}
      title={`${count} PI${count > 1 ? " revisions" : ""} created`}
      className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-1 text-[11px] font-medium hover:bg-primary/90 transition-colors"
    >
      <Eye className="h-3 w-3" />
      <Receipt className="h-3 w-3" />
      View PI{count > 1 ? ` ×${count}` : ""}
    </button>
  );
}

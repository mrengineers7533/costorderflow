import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Pencil, ClipboardList } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchOrderFamily, fetchBoqsForFamily } from "@/lib/revisions";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";
import { generateOrderPDF } from "@/lib/orders/pdf";
import { generateBoqPDF } from "@/lib/boq/pdf";

interface Props {
  rootOrderId: string;
  /** Bumped by the parent after a revise to force refetch. */
  reloadKey?: number;
}

export function RevisionsPanel({ rootOrderId, reloadKey }: Props) {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ords = await fetchOrderFamily(rootOrderId);
      setOrders(ords);
      const boqs = await fetchBoqsForFamily(ords.map((o) => o.id));
      setBoqs(boqs);
    } catch (e) {
      toast({ title: "Could not load revisions", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [rootOrderId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  async function downloadOaPdf(o: OrderRecord) {
    const doc = await generateOrderPDF(o);
    doc.save(`${(o.oa_number || "OA").replace(/[/\\]/g, "_")}-Rev${o.revision ?? 0}.pdf`);
  }
  async function downloadBoqPdf(b: BoqRecord) {
    const doc = await generateBoqPDF(b);
    doc.save(`${(b.boq_number || "BOQ").replace(/[/\\]/g, "_")}-Rev${b.revision ?? 0}.pdf`);
  }

  if (loading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading revisions…</CardContent></Card>;

  // Group BOQ revisions by their source OA revision id.
  const boqsBySourceOrder = new Map<string, BoqRecord[]>();
  boqs.forEach((b) => {
    const k = b.source_order_id || b.order_id;
    const arr = boqsBySourceOrder.get(k) || [];
    arr.push(b);
    boqsBySourceOrder.set(k, arr);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Revision History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.map((o) => {
          const linkedBoqs = boqsBySourceOrder.get(o.id) || [];
          return (
            <div key={o.id} className="rounded-lg border bg-card overflow-hidden">
              {/* OA row */}
              <div className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 ${o.is_current ? "bg-primary/5" : "bg-muted/30"}`}>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge variant={o.is_current ? "default" : "secondary"} className="text-[10px] uppercase tracking-wide">
                    {o.is_current ? "Current" : "Superseded"}
                  </Badge>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">OA</span>
                  <span className="font-mono text-sm font-semibold">{o.oa_number}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">Rev {o.revision ?? 0}</span>
                  <span className="text-[11px] text-muted-foreground capitalize">· {o.status}</span>
                  <span className="text-[11px] text-muted-foreground">· {new Date(o.created_at).toLocaleDateString("en-IN")}</span>
                  {o.prepared_by && <span className="text-[11px] text-muted-foreground">· by {o.prepared_by}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => nav(`/orders/${o.id}`)}>
                    {o.is_current ? <Pencil className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {o.is_current ? "Edit" : "View"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadOaPdf(o)}>
                    <Download className="h-3.5 w-3.5 mr-1" />OA PDF
                  </Button>
                </div>
              </div>
              {/* Linked BOQs (indented) */}
              {linkedBoqs.length > 0 ? (
                <div className="divide-y border-t">
                  {linkedBoqs.map((b) => (
                    <div key={b.id} className={`flex flex-wrap items-center justify-between gap-2 pl-6 pr-2.5 py-1.5 ${b.is_current ? "" : "opacity-70"}`}>
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Badge variant={b.is_current ? "default" : "outline"} className="text-[10px]">
                          {b.is_current ? "Current" : "Superseded"}
                        </Badge>
                        <ClipboardList className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">BOQ</span>
                        <span className="font-mono text-xs font-semibold">{b.boq_number}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted font-mono">Rev {b.revision ?? 0}</span>
                        <span className="text-[11px] text-muted-foreground capitalize">· {b.status}</span>
                        <span className="text-[11px] text-muted-foreground">· {new Date(b.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => nav(`/boqs/${b.id}`)}>
                          {b.is_current ? <Pencil className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                          {b.is_current ? "Edit" : "View"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => downloadBoqPdf(b)}>
                          <Download className="h-3.5 w-3.5 mr-1" />BOQ PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pl-8 pr-3 py-1.5 text-[11px] text-muted-foreground border-t italic">No BOQ generated for this OA revision.</div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
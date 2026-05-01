import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchOrderFamily, fetchBoqsForFamily } from "@/lib/revisions";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";

interface Props {
  rootOrderId: string;
  /** Bumped by the parent after a revise to force refetch. */
  reloadKey?: number;
}

export function RevisionsPanel({ rootOrderId, reloadKey }: Props) {
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

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

  // Lazy-load: only fetch when the section is opened (refetch on reloadKey while open).
  useEffect(() => { if (open) load(); }, [open, load, reloadKey]);

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
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <CardTitle className="text-base flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Revision History
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {loading && orders.length === 0 ? (
            <div className="py-2 text-sm text-muted-foreground">Loading revisions…</div>
          ) : null}
          {orders.map((o) => {
            const linkedBoqs = boqsBySourceOrder.get(o.id) || [];
            return (
              <div key={o.id} className="rounded-lg border bg-card overflow-hidden">
                {/* OA row */}
                <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${o.is_current ? "bg-primary/5" : "bg-muted/30"}`}>
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
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => nav(`/orders/${o.id}`)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />View
                    </Button>
                  </div>
                </div>
                {/* Linked BOQs (indented) */}
                {linkedBoqs.length > 0 ? (
                  <div className="divide-y border-t">
                    {linkedBoqs.map((b) => (
                      <div key={b.id} className={`flex flex-wrap items-center justify-between gap-2 pl-8 pr-3 py-1.5 ${b.is_current ? "" : "opacity-70"}`}>
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
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => nav(`/boqs/${b.id}`)}>
                            <Eye className="h-3.5 w-3.5 mr-1" />View
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
      )}
    </Card>
  );
}

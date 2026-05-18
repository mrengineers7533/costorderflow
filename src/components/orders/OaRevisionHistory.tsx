import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import type { OrderRecord } from "@/lib/orders/types";

export function OaRevisionHistory({ currentOrderId, rootOrderId }: { currentOrderId: string; rootOrderId: string }) {
  const [rows, setRows] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rootOrderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .or(`id.eq.${rootOrderId},parent_order_id.eq.${rootOrderId}`);
        const list = ((data as unknown as OrderRecord[]) || [])
          .slice()
          .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rootOrderId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">OA Revision History</CardTitle>
        <p className="text-xs text-muted-foreground">
          All saved revisions for this OA family. Open any prior revision in read-only view.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-16">Rev</th>
                <th className="p-2">OA Number</th>
                <th className="p-2">Date</th>
                <th className="p-2">Created/Updated By</th>
                <th className="p-2">Status</th>
                <th className="p-2 w-28 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No revisions yet.</td></tr>
              )}
              {rows.map((r) => {
                const isViewing = r.id === currentOrderId;
                const rev = r.revision ?? 0;
                const base = (r.oa_number || "").replace(/\/R\d+$/i, "");
                const display = rev > 0 ? `${base}/R${rev}` : base;
                return (
                  <tr key={r.id} className={`border-t ${isViewing ? "bg-primary/5" : ""}`}>
                    <td className="p-2 font-mono">R{rev}</td>
                    <td className="p-2 font-mono">{display}</td>
                    <td className="p-2">{new Date(r.order_date || r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="p-2">{r.prepared_by || "—"}</td>
                    <td className="p-2">
                      {r.is_current
                        ? <Badge className="text-[9px] uppercase">Current</Badge>
                        : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                      {isViewing && <Badge variant="secondary" className="ml-1 text-[9px] uppercase">Viewing</Badge>}
                    </td>
                    <td className="p-2 text-right">
                      {isViewing ? (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/orders/${r.id}`}><Eye className="h-3 w-3 mr-1" />View</Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import type { BoqRecord } from "@/lib/boq/types";

export function BoqRevisionHistory({
  currentBoqId,
  orderId,
  linkBase = "/boqs",
}: {
  currentBoqId: string | null;
  orderId: string | null;
  /** Base path for the View link. Defaults to /boqs; pass /design for the Design view. */
  linkBase?: string;
}) {
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentBoqId || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Preferred path (matches Admin): resolve OA family via orders.
        const { data: oaRow } = await supabase
          .from("orders").select("id,parent_order_id").eq("id", orderId).maybeSingle();
        const root = (oaRow as { parent_order_id?: string | null; id?: string } | null)?.parent_order_id
          || (oaRow as { id?: string } | null)?.id
          || orderId;
        const { data: famRows } = await supabase
          .from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
        const ids = Array.from(new Set([
          orderId, root,
          ...(((famRows || []) as Array<{ id: string }>).map((r) => r.id)),
        ].filter(Boolean))) as string[];
        let list: BoqRecord[] = [];
        if (ids.length > 0) {
          const { data: boqs } = await supabase
            .from("boqs").select("*").in("order_id", ids);
          list = ((boqs as unknown as BoqRecord[]) || []);
        }
        // Fallback for non-admin users (e.g. Design) whose `orders` RLS hides
        // the family lookup: BOQ revisions in one family share the same
        // boq_number, so pull all rows with the current BOQ's boq_number.
        if (list.length <= 1) {
          const { data: currentBoq } = await supabase
            .from("boqs").select("boq_number").eq("id", currentBoqId).maybeSingle();
          const boqNumber = (currentBoq as { boq_number?: string | null } | null)?.boq_number;
          if (boqNumber) {
            const { data: familyByNumber } = await supabase
              .from("boqs").select("*").eq("boq_number", boqNumber);
            const seen = new Set(list.map((r) => r.id));
            for (const r of ((familyByNumber as unknown as BoqRecord[]) || [])) {
              if (!seen.has(r.id)) { list.push(r); seen.add(r.id); }
            }
          }
        }
        list = list
          .slice()
          .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentBoqId, orderId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">BOQ Revision History</CardTitle>
        <p className="text-xs text-muted-foreground">
          All saved revisions for this BOQ family. Open any prior revision in read-only view.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-16">Rev</th>
                <th className="p-2">BOQ Number</th>
                <th className="p-2">Date</th>
                <th className="p-2">Status</th>
                <th className="p-2 w-28 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">No revisions yet.</td></tr>
              )}
              {rows.map((r) => {
                const isViewing = r.id === currentBoqId;
                return (
                  <tr key={r.id} className={`border-t ${isViewing ? "bg-primary/5" : ""}`}>
                    <td className="p-2 font-mono">R{r.revision ?? 0}</td>
                    <td className="p-2 font-mono">{r.boq_number}</td>
                    <td className="p-2">{new Date(r.created_at).toLocaleDateString()}</td>
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
                          <Link to={`${linkBase}/${r.id}`}><Eye className="h-3 w-3 mr-1" />View</Link>
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
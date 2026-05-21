import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";
import type { RequisitionItemRecord } from "@/lib/requisition/types";

interface ReqView {
  requisition_id: string;
  requisition_number: string;
  requisition_revision: number;
  requisition_status: string;
  current_boq_id: string | null;
  current_boq_number: string | null;
  current_boq_revision: number | null;
  client_name: string | null;
  reference_oa_number: string | null;
  created_at: string;
  order_root_id: string;
}

export default function PublicRequisition() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<ReqView | null>(null);
  const [items, setItems] = useState<RequisitionItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: v } = await sb.rpc("get_requisition_by_token", { _token: token });
      const row = Array.isArray(v) ? v[0] : v;
      setView(row as ReqView);
      const { data: its } = await sb.rpc("get_requisition_items_by_token", { _token: token });
      setItems((its as RequisitionItemRecord[]) || []);
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!view) return <div className="p-10 text-center text-sm text-muted-foreground">Requisition not found or link invalid.</div>;

  const stale = view.current_boq_revision != null && view.current_boq_revision > view.requisition_revision;

  function download() {
    if (!view || !token) return;
    const doc = generateRequisitionPDF({
      requisition: {
        id: view.requisition_id,
        requisition_number: view.requisition_number,
        order_root_id: view.order_root_id,
        boq_id: view.current_boq_id || "",
        boq_revision: view.requisition_revision,
        status: view.requisition_status as "issued",
        share_token: token,
        family_token: null,
        pdf_path: null,
        superseded_by_id: null,
        notes: null,
        user_id: null,
        created_at: view.created_at,
        updated_at: view.created_at,
      },
      items,
      boqNumber: view.current_boq_number || "",
      oaNumber: view.reference_oa_number || "",
      clientName: view.client_name || "",
      shareLink: `${window.location.origin}/requisition/${token}`,
    });
    doc.save(`${view.requisition_number.replace(/[/\\]/g, "_")}.pdf`);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{view.requisition_number}</h1>
          <p className="text-sm text-muted-foreground">
            {view.client_name || "—"} · OA {view.reference_oa_number || "—"}
          </p>
        </div>
        <Button onClick={download}><Download className="mr-1 h-4 w-4" />Download PDF</Button>
      </div>

      <Card>
        <CardContent className="py-4 flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">Requisition R{view.requisition_revision}</Badge>
          <Badge>{view.requisition_status}</Badge>
          {view.current_boq_number && (
            <Badge variant="outline">Current BOQ: {view.current_boq_number} (R{view.current_boq_revision})</Badge>
          )}
          {stale && (
            <span className="text-xs text-destructive font-medium">
              The BOQ has been revised since this requisition was issued. Showing items as of issuance.
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Finish Good items</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Model</th>
                <th className="text-left py-2 pr-3">Description</th>
                <th className="text-right py-2 pr-3">Qty</th>
                <th className="text-left py-2 pr-3">Unit</th>
                <th className="text-left py-2 pr-3">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No items.</td></tr>
              ) : items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{it.item_no}</td>
                  <td className="py-2 pr-3">{it.model_number}</td>
                  <td className="py-2 pr-3">{it.description}</td>
                  <td className="py-2 pr-3 text-right">{it.quantity}</td>
                  <td className="py-2 pr-3">{it.unit}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{it.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
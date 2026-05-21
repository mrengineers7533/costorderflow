import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2 } from "lucide-react";
import { sortByItemNo, type BoqRecord } from "@/lib/boq/types";
import { generateBoqDistributionPDF } from "@/lib/boq/pdfDistribution";

export default function FamilyBoq() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) { setError("Missing token"); setLoading(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_latest_approved_boq_by_family_token", { _token: token });
      if (error || !data) {
        setError("This link is invalid, revoked, or no approved BOQ is available yet.");
        setLoading(false);
        return;
      }
      setBoq(data as unknown as BoqRecord);
      setLoading(false);
    })();
  }, [token]);

  async function dl() {
    if (!boq) return;
    const link = window.location.href;
    const doc = await generateBoqDistributionPDF(boq, link);
    doc.save(`${boq.boq_number.replace(/[/\\]/g, "_")}_R${boq.revision ?? 0}_distribution.pdf`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md"><CardHeader><CardTitle>Unavailable</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{error}</p></CardContent></Card></div>;
  if (!boq) return null;

  const items = sortByItemNo(boq.line_items || []);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-5">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Latest Approved BOQ · Live Link</div>
                <CardTitle className="mt-1 font-mono">{boq.boq_number}</CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {boq.client_name || "—"} {boq.project_number ? `· ${boq.project_number}` : ""}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Revision R{boq.revision ?? 0} · This page always serves the latest approved revision.
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>
                <Button size="sm" onClick={dl}><Download className="mr-1 h-4 w-4" />Download Distribution PDF</Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 w-10">#</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 w-14">Qty</th>
                  <th className="p-2 w-14">Unit</th>
                  <th className="p-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id || i} className="border-t align-top">
                    <td className="p-2">{it.item_no || i + 1}</td>
                    <td className="p-2 font-mono">{it.model_number}</td>
                    <td className="p-2 whitespace-pre-wrap">{it.description}</td>
                    <td className="p-2">{it.quantity ?? 0}</td>
                    <td className="p-2">{it.unit || "Nos"}</td>
                    <td className="p-2 whitespace-pre-wrap">{it.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

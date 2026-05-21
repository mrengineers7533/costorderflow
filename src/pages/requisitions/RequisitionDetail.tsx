import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Copy, Download, Link2 } from "lucide-react";
import type { RequisitionItemRecord, RequisitionRecord } from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<RequisitionRecord | null>(null);
  const [items, setItems] = useState<RequisitionItemRecord[]>([]);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [latestRev, setLatestRev] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  async function load() {
    if (!id) return;
    const { data: r } = await sb.from("requisitions").select("*").eq("id", id).maybeSingle();
    setReq(r as RequisitionRecord);
    if (!r) { setLoading(false); return; }
    const { data: its } = await sb.from("requisition_items").select("*").eq("requisition_id", id).order("item_no");
    setItems((its as RequisitionItemRecord[]) || []);
    const { data: b } = await supabase.from("boqs").select("*").eq("id", r.boq_id).maybeSingle();
    setBoq(b as unknown as BoqRecord);
    // latest approved revision for the family
    const { data: order } = await supabase.from("orders").select("id, parent_order_id").eq("id", (b as { order_id: string })?.order_id).maybeSingle();
    const root = (order as { parent_order_id?: string | null; id: string } | null)?.parent_order_id || (order as { id: string } | null)?.id;
    if (root) {
      const { data: orders } = await supabase.from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
      const ids = (orders as Array<{ id: string }> || []).map((o) => o.id);
      const { data: allBoqs } = await supabase.from("boqs")
        .select("revision, verification_status")
        .in("order_id", ids).eq("verification_status", "approved");
      const max = ((allBoqs as Array<{ revision: number }>) || []).reduce((m, x) => Math.max(m, x.revision ?? 0), 0);
      setLatestRev(max);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  const shareLink = useMemo(
    () => req ? `${window.location.origin}/requisition/${req.share_token}` : "",
    [req],
  );
  const familyLink = useMemo(
    () => req?.family_token ? `${window.location.origin}/boq/family/${req.family_token}` : "",
    [req],
  );
  const stale = latestRev != null && req != null && latestRev > req.boq_revision;

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    toast({ title: "Link copied" });
  }

  function downloadPDF() {
    if (!req || !boq) return;
    const doc = generateRequisitionPDF({
      requisition: req,
      items,
      boqNumber: boq.boq_number,
      oaNumber: boq.reference_oa_number || "",
      clientName: boq.client_name || "",
      shareLink,
      familyLink,
    });
    const safe = req.requisition_number.replace(/[/\\]/g, "_");
    doc.save(`${safe}.pdf`);
  }

  async function updateItem(itemId: string, patch: Partial<RequisitionItemRecord>) {
    await sb.from("requisition_items").update(patch).eq("id", itemId);
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, ...patch } : it));
  }

  async function regenerate() {
    if (!boq) return;
    // close current
    await sb.from("requisitions").update({ status: "closed" }).eq("id", req!.id);
    // pull latest approved boq for the family
    const { data: order } = await supabase.from("orders").select("id, parent_order_id").eq("id", boq.order_id).maybeSingle();
    const root = (order as { parent_order_id?: string | null; id: string } | null)?.parent_order_id || (order as { id: string } | null)?.id;
    if (!root) return;
    const { data: orders } = await supabase.from("orders").select("id").or(`id.eq.${root},parent_order_id.eq.${root}`);
    const ids = (orders as Array<{ id: string }> || []).map((o) => o.id);
    const { data: allBoqs } = await supabase.from("boqs").select("*").in("order_id", ids).eq("verification_status", "approved").order("revision", { ascending: false }).limit(1);
    const latest = (allBoqs as unknown as BoqRecord[])?.[0];
    if (!latest) { toast({ title: "No approved BOQ found", variant: "destructive" }); return; }
    const { error } = await supabase.functions.invoke("create-requisition", { body: { boq_id: latest.id } });
    if (error) { toast({ title: "Regenerate failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Regenerated for latest revision" });
    load();
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!req) return <div className="p-6 text-sm text-muted-foreground">Requisition not found.</div>;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">{req.requisition_number}</h1>
            <Badge variant="secondary">BOQ R{req.boq_revision}</Badge>
            <Badge>{req.status}</Badge>
            {stale && <Badge variant="destructive">BOQ revised to R{latestRev}</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {boq?.client_name || "—"} · OA {boq?.reference_oa_number || "—"} · BOQ {boq?.boq_number || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/requisitions"><Button variant="outline" size="sm">Back</Button></Link>
          {stale && <Button size="sm" onClick={regenerate}>Regenerate for R{latestRev}</Button>}
          <Button size="sm" variant="outline" onClick={downloadPDF}><Download className="mr-1 h-4 w-4" />PDF</Button>
        </div>
      </div>

      <Card>
        <CardContent className="py-3 flex flex-wrap items-center gap-3 text-xs">
          <Link2 className="h-3.5 w-3.5" />
          <code className="flex-1 truncate text-[11px]">{shareLink}</code>
          <Button size="sm" variant="outline" onClick={copyLink}><Copy className="h-3.5 w-3.5" /></Button>
          <span className="text-muted-foreground">
            Always resolves to the latest approved BOQ revision.
          </span>
        </CardContent>
      </Card>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="steel">Steel List</TabsTrigger>
          <TabsTrigger value="outside">Outside Purchase</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <CardHeader><CardTitle className="text-sm">Finish Good items</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3 w-8">✓</th>
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Model</th>
                    <th className="text-left py-2 pr-3">Description</th>
                    <th className="text-right py-2 pr-3">Qty</th>
                    <th className="text-left py-2 pr-3">Unit</th>
                    <th className="text-left py-2 pr-3">Lot</th>
                    <th className="text-left py-2 pr-3">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={8} className="py-4 text-center text-muted-foreground">No items.</td></tr>
                  ) : items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={it.purchase_status === "checked" || it.purchase_status === "lotted" || it.purchase_status === "ordered"}
                          onCheckedChange={(c) => updateItem(it.id, { purchase_status: c ? "checked" : "pending" })}
                        />
                      </td>
                      <td className="py-2 pr-3">{it.item_no}</td>
                      <td className="py-2 pr-3">{it.model_number}</td>
                      <td className="py-2 pr-3">{it.description}</td>
                      <td className="py-2 pr-3 text-right">{it.quantity}</td>
                      <td className="py-2 pr-3">{it.unit}</td>
                      <td className="py-2 pr-3">
                        <Input
                          className="h-7 w-20"
                          value={it.lot_no || ""}
                          onChange={(e) => updateItem(it.id, { lot_no: e.target.value || null, purchase_status: e.target.value ? "lotted" : it.purchase_status })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Select
                          value={it.purchase_category || ""}
                          onValueChange={(v) => updateItem(it.id, { purchase_category: (v as "steel" | "outside") || null })}
                        >
                          <SelectTrigger className="h-7 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="steel">Steel</SelectItem>
                            <SelectItem value="outside">Outside</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {(["steel", "outside"] as const).map((cat) => (
          <TabsContent key={cat} value={cat}>
            <Card>
              <CardHeader><CardTitle className="text-sm capitalize">{cat} purchase list</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-3">#</th>
                      <th className="text-left py-2 pr-3">Model</th>
                      <th className="text-left py-2 pr-3">Description</th>
                      <th className="text-right py-2 pr-3">Qty</th>
                      <th className="text-left py-2 pr-3">Unit</th>
                      <th className="text-left py-2 pr-3">Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter((i) => i.purchase_category === cat).length === 0 ? (
                      <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No items assigned.</td></tr>
                    ) : items.filter((i) => i.purchase_category === cat).map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{it.item_no}</td>
                        <td className="py-2 pr-3">{it.model_number}</td>
                        <td className="py-2 pr-3">{it.description}</td>
                        <td className="py-2 pr-3 text-right">{it.quantity}</td>
                        <td className="py-2 pr-3">{it.unit}</td>
                        <td className="py-2 pr-3">{it.lot_no || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
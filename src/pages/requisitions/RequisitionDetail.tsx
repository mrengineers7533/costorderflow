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
import { Columns3, Copy, Download, Link2 } from "lucide-react";
import type { RequisitionItemRecord, RequisitionRecord, RequisitionRawMaterialRecord } from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { OrderRecord } from "@/lib/orders/types";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";
import { useColumnToggle } from "@/hooks/useColumnToggle";
import { buildMakeResolver } from "@/lib/boq/makeResolver";

export default function RequisitionDetail() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<RequisitionRecord | null>(null);
  const [items, setItems] = useState<RequisitionItemRecord[]>([]);
  const [rms, setRms] = useState<RequisitionRawMaterialRecord[]>([]);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [latestRev, setLatestRev] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMake, setShowMake] = useColumnToggle("requisition.columns.make", false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  async function load() {
    if (!id) return;
    const { data: r } = await sb.from("requisitions").select("*").eq("id", id).maybeSingle();
    setReq(r as RequisitionRecord);
    if (!r) { setLoading(false); return; }
    const { data: its } = await sb.from("requisition_items").select("*").eq("requisition_id", id).order("item_no");
    setItems((its as RequisitionItemRecord[]) || []);
    const { data: rmRows } = await sb.from("requisition_raw_materials").select("*").eq("requisition_id", id).order("material");
    setRms((rmRows as RequisitionRawMaterialRecord[]) || []);
    const { data: b } = await supabase.from("boqs").select("*").eq("id", r.boq_id).maybeSingle();
    setBoq(b as unknown as BoqRecord);
    // latest approved revision for the family
    const { data: order } = await supabase.from("orders").select("id, parent_order_id").eq("id", (b as { order_id: string })?.order_id).maybeSingle();
    const root = (order as { parent_order_id?: string | null; id: string } | null)?.parent_order_id || (order as { id: string } | null)?.id;
    // also fetch the linked OA revision in full so we can resolve Make from OA
    const oaId = (b as { source_order_id?: string; order_id?: string } | null)?.source_order_id
      || (b as { order_id?: string } | null)?.order_id;
    if (oaId) {
      const { data: full } = await supabase.from("orders").select("*").eq("id", oaId).maybeSingle();
      setOrder((full as unknown as OrderRecord) || null);
    }
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
      rawMaterials: rms,
      boqNumber: boq.boq_number,
      oaNumber: boq.reference_oa_number || "",
      clientName: boq.client_name || "",
      shareLink,
      familyLink,
      showMake,
    });
    const safe = req.requisition_number.replace(/[/\\]/g, "_");
    doc.save(`${safe}.pdf`);
  }

  async function updateItem(itemId: string, patch: Partial<RequisitionItemRecord>) {
    await sb.from("requisition_items").update(patch).eq("id", itemId);
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, ...patch } : it));
  }

  async function updateRm(rmId: string, patch: Partial<RequisitionRawMaterialRecord>) {
    await sb.from("requisition_raw_materials").update(patch).eq("id", rmId);
    setRms((prev) => prev.map((r) => r.id === rmId ? { ...r, ...patch } : r));
  }

  const hasUnmapped = rms.some((r) => r.source === "unmapped_placeholder");

  // Group RM rows by Finish Good (requisition_item_id), preserving FG order.
  const itemById = useMemo(() => {
    const m = new Map<string, RequisitionItemRecord>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  const rmGroups = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, RequisitionRawMaterialRecord[]>();
    const keyOf = (r: RequisitionRawMaterialRecord) =>
      r.requisition_item_id || `__model__:${r.model_number || "—"}`;
    rms.forEach((r) => {
      const k = keyOf(r);
      if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
      buckets.get(k)!.push(r);
    });
    // sort groups by FG item_no when available
    const numKey = (s: string | null | undefined) => {
      const n = parseFloat(String(s ?? ""));
      return Number.isFinite(n) ? n : 9999;
    };
    order.sort((a, b) => numKey(itemById.get(a)?.item_no) - numKey(itemById.get(b)?.item_no));
    return order.map((k) => ({
      key: k,
      item: itemById.get(k) || null,
      fgLabel: itemById.get(k)?.model_number || itemById.get(k)?.description || buckets.get(k)![0].model_number || "—",
      rms: buckets.get(k)!,
    }));
  }, [rms, itemById]);

  // Resolve Make for a requisition item: prefer fg_snapshot.make, then
  // the BOQ item's stored Make, then the linked OA's Make (by description
  // /model match or row index).
  const resolveReqMake = useMemo(() => {
    const fromOa = buildMakeResolver(order?.line_items);
    const boqItems = Array.isArray(boq?.line_items) ? boq!.line_items : [];
    const boqById = new Map(boqItems.map((b, i) => [b.id, { item: b, index: i }] as const));
    return (it: RequisitionItemRecord): string => {
      const snap = (it.fg_snapshot as { make?: string } | null)?.make;
      if (snap && snap.trim()) return snap.trim();
      const hit = boqById.get(it.boq_item_id);
      if (hit) return fromOa(hit.item, hit.index);
      return "";
    };
  }, [order, boq]);

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
          <TabsTrigger value="raw">Raw Materials</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="steel">Steel List</TabsTrigger>
          <TabsTrigger value="outside">Outside Purchase</TabsTrigger>
        </TabsList>

        <TabsContent value="raw">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">Raw material indent</CardTitle>
              <Button
                type="button"
                variant={showMake ? "secondary" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setShowMake(!showMake)}
                title="Hidden by default. Also controls the PDF export."
              >
                <Columns3 className="h-4 w-4" />
                {showMake ? "Hide Make column" : "Show Make column"}
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto space-y-3">
              {hasUnmapped && (
                <div className="text-xs rounded border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2">
                  Some Finish Good items have no Raw Material mapping. Configure them in
                  {" "}<Link to="/admin/raw-materials" className="underline font-medium">Admin → Raw Materials</Link>.
                </div>
              )}
              <table className="w-full text-sm border">
                <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                  <tr>
                    <th className="text-left py-2 px-3 border-r">Finished Good</th>
                    <th className="text-left py-2 px-3 border-r">Raw Material</th>
                    {showMake && <th className="text-left py-2 px-3 border-r">Make</th>}
                    <th className="text-left py-2 px-3 border-r">Size / Spec</th>
                    <th className="text-right py-2 px-3 border-r">Reqd Qty</th>
                    <th className="text-left py-2 px-3 border-r">Unit</th>
                    <th className="text-left py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rmGroups.length === 0 ? (
                    <tr><td colSpan={showMake ? 7 : 6} className="py-4 text-center text-muted-foreground">No raw materials generated.</td></tr>
                  ) : rmGroups.flatMap((g) => g.rms.map((r, idx) => {
                    const unmapped = g.rms.some((x) => x.source === "unmapped_placeholder");
                    return (
                      <tr key={r.id} className={`border-b last:border-0 ${r.source === "unmapped_placeholder" ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}>
                        {idx === 0 && (
                          <td className="py-2 px-3 align-top border-r font-medium" rowSpan={g.rms.length}>
                            {g.fgLabel}
                            {unmapped && <Badge variant="outline" className="ml-2">Mapping Not Found</Badge>}
                          </td>
                        )}
                        <td className="py-2 px-3 border-r">{r.material}</td>
                        {showMake && <td className="py-2 px-3 border-r">{r.make || "—"}</td>}
                        <td className="py-2 px-3 border-r">{r.size_model || "—"}</td>
                        <td className="py-2 px-3 border-r text-right">{r.required_qty ?? "—"}</td>
                        <td className="py-2 px-3 border-r">{r.unit || "—"}</td>
                        <td className="py-2 px-3">
                          <Select
                            value={r.purchase_status}
                            onValueChange={(v) => updateRm(r.id, { purchase_status: v as "pending" | "ordered" | "received" })}
                          >
                            <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="ordered">Ordered</SelectItem>
                              <SelectItem value="received">Received</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-sm">Finish Good items</CardTitle>
              <Button
                type="button"
                variant={showMake ? "secondary" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setShowMake(!showMake)}
                title="Hidden by default. Inherited from OA via BOQ."
              >
                <Columns3 className="h-4 w-4" />
                {showMake ? "Hide Make column" : "Show Make column"}
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 pr-3 w-8">✓</th>
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Model</th>
                    <th className="text-left py-2 pr-3">Description</th>
                    {showMake && <th className="text-left py-2 pr-3">Make</th>}
                    <th className="text-right py-2 pr-3">Qty</th>
                    <th className="text-left py-2 pr-3">Unit</th>
                    <th className="text-left py-2 pr-3">Lot</th>
                    <th className="text-left py-2 pr-3">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={showMake ? 9 : 8} className="py-4 text-center text-muted-foreground">No items.</td></tr>
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
                      {showMake && (
                        <td className="py-2 pr-3">{(it.fg_snapshot as { make?: string } | null)?.make || "—"}</td>
                      )}
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
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm capitalize">{cat} purchase list</CardTitle>
                <Button
                  type="button"
                  variant={showMake ? "secondary" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowMake(!showMake)}
                  title="Hidden by default. Inherited from OA via BOQ."
                >
                  <Columns3 className="h-4 w-4" />
                  {showMake ? "Hide Make column" : "Show Make column"}
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-3">#</th>
                      <th className="text-left py-2 pr-3">Model</th>
                      <th className="text-left py-2 pr-3">Description</th>
                      {showMake && <th className="text-left py-2 pr-3">Make</th>}
                      <th className="text-right py-2 pr-3">Qty</th>
                      <th className="text-left py-2 pr-3">Unit</th>
                      <th className="text-left py-2 pr-3">Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter((i) => i.purchase_category === cat).length === 0 ? (
                      <tr><td colSpan={showMake ? 7 : 6} className="py-4 text-center text-muted-foreground">No items assigned.</td></tr>
                    ) : items.filter((i) => i.purchase_category === cat).map((it) => (
                      <tr key={it.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{it.item_no}</td>
                        <td className="py-2 pr-3">{it.model_number}</td>
                        <td className="py-2 pr-3">{it.description}</td>
                        {showMake && (
                          <td className="py-2 pr-3">{(it.fg_snapshot as { make?: string } | null)?.make || "—"}</td>
                        )}
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
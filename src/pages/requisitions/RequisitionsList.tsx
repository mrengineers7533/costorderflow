import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Eye, Download, Link2, Send, ClipboardList } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generateRequisitionPDF } from "@/lib/requisition/pdf";
import type {
  RequisitionRecord,
  RequisitionItemRecord,
  RequisitionRawMaterialRecord,
} from "@/lib/requisition/types";
import type { BoqRecord } from "@/lib/boq/types";

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN") : "—";

export default function RequisitionsList() {
  const [reqs, setReqs] = useState<RequisitionRecord[]>([]);
  const [boqs, setBoqs] = useState<Record<string, BoqRecord>>({});
  const [latestRevByRoot, setLatestRevByRoot] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: r } = await sb.from("requisitions").select("*").order("created_at", { ascending: false });
      const list = (r as RequisitionRecord[]) || [];
      setReqs(list);

      const boqIds = Array.from(new Set(list.map((x) => x.boq_id)));
      const rootIds = Array.from(new Set(list.map((x) => x.order_root_id)));
      if (boqIds.length) {
        const { data: b } = await supabase.from("boqs").select("*").in("id", boqIds);
        const map: Record<string, BoqRecord> = {};
        ((b as unknown as BoqRecord[]) || []).forEach((x) => { map[x.id] = x; });
        setBoqs(map);
      }
      if (rootIds.length) {
        // compute latest approved revision per family for staleness banner
        const { data: allBoqs } = await supabase
          .from("boqs").select("id, order_id, revision, verification_status");
        const { data: orders } = await supabase.from("orders").select("id, parent_order_id");
        const familyOf = new Map<string, string>();
        (orders || []).forEach((o) => familyOf.set(o.id as string, (o as { parent_order_id?: string | null; id: string }).parent_order_id || (o.id as string)));
        const latest: Record<string, number> = {};
        ((allBoqs as Array<{ order_id: string; revision: number; verification_status: string }>) || [])
          .filter((b) => b.verification_status === "approved")
          .forEach((b) => {
            const fam = familyOf.get(b.order_id) || b.order_id;
            if (latest[fam] == null || (b.revision ?? 0) > latest[fam]) latest[fam] = b.revision ?? 0;
          });
        setLatestRevByRoot(latest);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reqs;
    return reqs.filter((r) => {
      const b = boqs[r.boq_id];
      return [r.requisition_number, b?.boq_number, b?.reference_oa_number, b?.client_name]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [reqs, boqs, search]);

  function toggle(id: string) {
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allOnPageSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((p) => {
      const n = new Set(p);
      if (allOnPageSelected) filtered.forEach((r) => n.delete(r.id));
      else filtered.forEach((r) => n.add(r.id));
      return n;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  async function copyLink(r: RequisitionRecord) {
    const link = `${window.location.origin}/requisition/${r.share_token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: link });
  }

  async function downloadPdf(r: RequisitionRecord) {
    setBusyId(r.id);
    try {
      const b = boqs[r.boq_id];
      const [{ data: its }, { data: rms }] = await Promise.all([
        sb.from("requisition_items").select("*").eq("requisition_id", r.id).order("item_no"),
        sb.from("requisition_raw_materials").select("*").eq("requisition_id", r.id).order("material"),
      ]);
      const shareLink = `${window.location.origin}/requisition/${r.share_token}`;
      const familyLink = r.family_token ? `${window.location.origin}/boq/family/${r.family_token}` : "";
      const doc = generateRequisitionPDF({
        requisition: r,
        items: (its as RequisitionItemRecord[]) || [],
        rawMaterials: (rms as RequisitionRawMaterialRecord[]) || [],
        boqNumber: b?.boq_number || "",
        oaNumber: b?.reference_oa_number || "",
        clientName: b?.client_name || "",
        shareLink,
        familyLink,
      });
      doc.save(`${r.requisition_number.replace(/[/\\]/g, "_")}.pdf`);
    } catch (e) {
      toast({ title: "PDF failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function sendToPurchase(r: RequisitionRecord) {
    setBusyId(r.id);
    const { error } = await sb.from("requisitions").update({ status: "in_purchase" }).eq("id", r.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
      return;
    }
    setReqs((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "in_purchase" } : x)));
    toast({ title: "Sent to Purchase" });
  }

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Requisitions</h1>
          <p className="text-xs text-muted-foreground">
            Material requisitions generated by Manufacturing from approved BOQs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Badge variant="secondary">{selected.size} selected</Badge>
              <Button
                size="sm"
                disabled={selected.size < 2}
                onClick={() => navigate(`/requisitions/plan?ids=${Array.from(selected).join(",")}`)}
                title={selected.size < 2 ? "Select 2 or more to plan together" : "Open plan"}
              >
                <ClipboardList className="mr-1 h-4 w-4" />Open Plan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search requisition, OA, client…" className="h-8 pl-7 w-64"
                   value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requisitions yet. Open an approved BOQ in Manufacturing and use "Create Requisition".
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left py-2 px-3 w-8">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left py-2 px-3">Requisition #</th>
                  <th className="text-left py-2 px-3">OA #</th>
                  <th className="text-left py-2 px-3">BOQ #</th>
                  <th className="text-left py-2 px-3">Rev</th>
                  <th className="text-left py-2 px-3">Client</th>
                  <th className="text-left py-2 px-3">Created</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-right py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const b = boqs[r.boq_id];
                  const latest = latestRevByRoot[r.order_root_id];
                  const stale = latest != null && latest > r.boq_revision;
                  const sent = r.status === "in_purchase" || r.status === "closed";
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 px-3">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </td>
                      <td className="py-2 px-3 font-medium">{r.requisition_number}</td>
                      <td className="py-2 px-3">{b?.reference_oa_number || "—"}</td>
                      <td className="py-2 px-3">{b?.boq_number || "—"}</td>
                      <td className="py-2 px-3">R{r.boq_revision}</td>
                      <td className="py-2 px-3 max-w-[220px] truncate">{b?.client_name || "—"}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{fmtDate(r.created_at)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge>{r.status}</Badge>
                          {stale && <Badge variant="destructive">R{latest} avail</Badge>}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/requisitions/${r.id}`}>
                            <Button size="sm" variant="ghost" title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button size="sm" variant="ghost" title="Download PDF"
                                  disabled={busyId === r.id}
                                  onClick={() => downloadPdf(r)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Copy link"
                                  onClick={() => copyLink(r)}>
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant={sent ? "ghost" : "outline"} title="Send to Purchase"
                                  disabled={sent || busyId === r.id}
                                  onClick={() => sendToPurchase(r)}>
                            <Send className="h-4 w-4 mr-1" />
                            {sent ? "Sent" : "Send"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
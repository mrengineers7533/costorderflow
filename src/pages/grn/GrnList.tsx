import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, PackageCheck, MessageSquare, RotateCcw, Upload, Eye, Download, RefreshCw } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Po = {
  id: string;
  po_number: string;
  po_date: string | null;
  created_at: string;
  vendor_name: string;
  status: "active" | "cancelled";
  requisition_ids: string[] | null;
  annexure_ids: string[] | null;
};
type PoRow = {
  id: string;
  po_id: string;
  lot_no: string | null;
  material: string;
  size_model: string | null;
  make: string | null;
  unit: string | null;
  qty: number | null;
  rate: number | null;
  line_amount: number | null;
  due_on: string | null;
};
type Grn = {
  id: string;
  po_row_id: string;
  po_id: string;
  material_reached_date: string | null;
  delay_days: number | null;
  received_qty: number | null;
  late_comment: string | null;
  gate_entry_done: boolean;
  gate_entry_at: string | null;
  gate_entry_by: string | null;
  status: string;
  invoice_path?: string | null;
  invoice_file_name?: string | null;
  invoice_mime?: string | null;
  invoice_size?: number | null;
  invoice_uploaded_by?: string | null;
  invoice_uploaded_at?: string | null;
};
type Requisition = {
  id: string;
  requisition_number: string;
  order_root_id: string;
  boq_id: string;
};
type Order = { id: string; oa_number: string | null; cost_sheet_number: string | null };
type Boq = { id: string; boq_number: string | null };
type Profile = { id: string; full_name: string | null; email: string | null };

type Joined = {
  po: Po;
  row: PoRow;
  grn: Grn | null;
  refs: { oa: string[]; boq: string[]; req: string[]; cs: string[] };
};

const statusColor: Record<string, string> = {
  pending: "bg-muted text-foreground",
  gate_entry_done: "bg-blue-600 text-white",
  material_received: "bg-emerald-600 text-white",
  delayed: "bg-destructive text-destructive-foreground",
  partially_received: "bg-amber-500 text-white",
};
const statusLabel: Record<string, string> = {
  pending: "Pending",
  gate_entry_done: "Gate Entry Done",
  material_received: "Material Received",
  delayed: "Delayed",
  partially_received: "Partially Received",
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diffDays(a: string, b: string) {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}
function computeStatus(row: PoRow, g: Partial<Grn>) {
  const qty = row.qty ?? 0;
  const rq = g.received_qty ?? null;
  if (rq != null && qty > 0 && rq > 0 && rq < qty) return "partially_received";
  if (g.material_reached_date) {
    if (row.due_on && diffDays(g.material_reached_date, row.due_on) > 0) return "delayed";
    return "material_received";
  }
  if (g.gate_entry_done) return "gate_entry_done";
  return "pending";
}
function computeDelay(reached: string | null, due: string | null): number | null {
  if (!reached || !due) return null;
  return Math.max(0, diffDays(reached, due));
}

export default function GrnList() {
  const [pos, setPos] = useState<Po[]>([]);
  const [rows, setRows] = useState<PoRow[]>([]);
  const [grns, setGrns] = useState<Record<string, Grn>>({});
  const [reqs, setReqs] = useState<Record<string, Requisition>>({});
  const [orders, setOrders] = useState<Record<string, Order>>({});
  const [boqs, setBoqs] = useState<Record<string, Boq>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyPending, setOnlyPending] = useState(false);

  const [commentRow, setCommentRow] = useState<Joined | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: pData } = await sb
      .from("purchase_orders")
      .select("id,po_number,po_date,created_at,vendor_name,status,requisition_ids,annexure_ids")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const pList = (pData || []) as Po[];
    setPos(pList);
    const poIds = pList.map((p) => p.id);
    if (!poIds.length) {
      setRows([]); setGrns({}); setLoading(false); return;
    }
    const { data: rData } = await sb
      .from("purchase_order_rows")
      .select("id,po_id,lot_no,material,size_model,make,unit,qty,rate,line_amount,due_on")
      .in("po_id", poIds);
    const rList = (rData || []) as PoRow[];
    setRows(rList);

    const { data: gData } = await sb.from("grn_receipts").select("*").in("po_id", poIds);
    const gMap: Record<string, Grn> = {};
    ((gData || []) as Grn[]).forEach((g) => { gMap[g.po_row_id] = g; });
    setGrns(gMap);

    const reqIds = Array.from(new Set(pList.flatMap((p) => p.requisition_ids || []))).filter(Boolean);
    if (reqIds.length) {
      const { data: rqData } = await sb
        .from("requisitions")
        .select("id,requisition_number,order_root_id,boq_id")
        .in("id", reqIds);
      const rmap: Record<string, Requisition> = {};
      ((rqData || []) as Requisition[]).forEach((r) => { rmap[r.id] = r; });
      setReqs(rmap);

      const rootIds = Array.from(new Set((rqData || []).map((r: Requisition) => r.order_root_id).filter(Boolean)));
      const boqIds = Array.from(new Set((rqData || []).map((r: Requisition) => r.boq_id).filter(Boolean)));
      if (rootIds.length) {
        const { data: oData } = await sb
          .from("orders")
          .select("id,oa_number,cost_sheet_number")
          .in("id", rootIds);
        const omap: Record<string, Order> = {};
        ((oData || []) as Order[]).forEach((o) => { omap[o.id] = o; });
        setOrders(omap);
      }
      if (boqIds.length) {
        const { data: bData } = await sb.from("boqs").select("id,boq_number").in("id", boqIds);
        const bmap: Record<string, Boq> = {};
        ((bData || []) as Boq[]).forEach((b) => { bmap[b.id] = b; });
        setBoqs(bmap);
      }
    }

    const gateUserIds = Array.from(new Set(((gData || []) as Grn[]).map((g) => g.gate_entry_by).filter(Boolean) as string[]));
    const invUserIds = Array.from(new Set(((gData || []) as Grn[]).map((g) => g.invoice_uploaded_by).filter(Boolean) as string[]));
    const allUserIds = Array.from(new Set([...gateUserIds, ...invUserIds]));
    if (allUserIds.length) {
      const { data: pr } = await sb.from("profiles").select("id,full_name,email").in("id", allUserIds);
      const pm: Record<string, Profile> = {};
      ((pr || []) as Profile[]).forEach((p) => { pm[p.id] = p; });
      setProfiles(pm);
    }

    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const joined = useMemo<Joined[]>(() => {
    const poMap: Record<string, Po> = {};
    pos.forEach((p) => { poMap[p.id] = p; });
    return rows.map((r) => {
      const po = poMap[r.po_id];
      if (!po) return null;
      const reqIds = po.requisition_ids || [];
      const oa: string[] = [];
      const boq: string[] = [];
      const req: string[] = [];
      const cs: string[] = [];
      reqIds.forEach((rid) => {
        const rq = reqs[rid];
        if (!rq) return;
        if (rq.requisition_number) req.push(rq.requisition_number);
        const ord = orders[rq.order_root_id];
        if (ord?.oa_number) oa.push(ord.oa_number);
        if (ord?.cost_sheet_number) cs.push(ord.cost_sheet_number);
        const b = boqs[rq.boq_id];
        if (b?.boq_number) boq.push(b.boq_number);
      });
      return {
        po, row: r, grn: grns[r.id] || null,
        refs: {
          oa: Array.from(new Set(oa)),
          boq: Array.from(new Set(boq)),
          req: Array.from(new Set(req)),
          cs: Array.from(new Set(cs)),
        },
      } as Joined;
    }).filter(Boolean) as Joined[];
  }, [pos, rows, grns, reqs, orders, boqs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return joined.filter((j) => {
      const status = j.grn?.status || "pending";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (onlyPending && status !== "pending") return false;
      if (needle) {
        const hay = [
          j.po.po_number, j.po.vendor_name, j.row.material, j.row.size_model || "",
          j.row.make || "", j.row.lot_no || "",
          ...j.refs.oa, ...j.refs.boq, ...j.refs.req, ...j.refs.cs,
        ].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [joined, q, statusFilter, onlyPending]);

  const upsertGrn = async (j: Joined, patch: Partial<Grn>) => {
    const current = j.grn || {
      po_row_id: j.row.id,
      po_id: j.po.id,
      material_reached_date: null,
      received_qty: null,
      late_comment: null,
      gate_entry_done: false,
      gate_entry_at: null,
      gate_entry_by: null,
      status: "pending",
    } as Partial<Grn>;
    const merged: Partial<Grn> = { ...current, ...patch };
    merged.delay_days = computeDelay(merged.material_reached_date ?? null, j.row.due_on ?? null);
    merged.status = computeStatus(j.row, merged);

    const payload = {
      po_row_id: j.row.id,
      po_id: j.po.id,
      material_reached_date: merged.material_reached_date ?? null,
      delay_days: merged.delay_days ?? null,
      received_qty: merged.received_qty ?? null,
      late_comment: merged.late_comment ?? null,
      gate_entry_done: merged.gate_entry_done ?? false,
      gate_entry_at: merged.gate_entry_at ?? null,
      gate_entry_by: merged.gate_entry_by ?? null,
      status: merged.status ?? "pending",
    };
    const { data, error } = await sb
      .from("grn_receipts")
      .upsert(payload, { onConflict: "po_row_id" })
      .select("*")
      .maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (data) setGrns((m) => ({ ...m, [j.row.id]: data as Grn }));
  };

  const markGateEntry = async (j: Joined) => {
    const { data: u } = await sb.auth.getUser();
    const uid = u?.user?.id || null;
    await upsertGrn(j, {
      gate_entry_done: true,
      gate_entry_at: new Date().toISOString(),
      gate_entry_by: uid,
    });
    toast.success("Gate entry recorded");
  };

  const undoGateEntry = async (j: Joined) => {
    await upsertGrn(j, { gate_entry_done: false, gate_entry_at: null, gate_entry_by: null });
  };

  const openComment = (j: Joined) => {
    setCommentRow(j);
    setCommentDraft(j.grn?.late_comment || "");
  };
  const saveComment = async () => {
    if (!commentRow) return;
    await upsertGrn(commentRow, { late_comment: commentDraft || null });
    setCommentRow(null);
    toast.success("Comment saved");
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">GRN — Goods Receipt</h1>
          <p className="text-xs text-muted-foreground">
            Track factory receipt against each PO line item. Gate entry, reached date, delay and late-reason are stored per item.
          </p>
        </div>
        <Link to="/purchase"><Button size="sm" variant="outline">Back to Purchase</Button></Link>
      </div>

      <Card>
        <CardContent className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7"
              placeholder="Search PO / vendor / material / OA / BOQ / Req"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.keys(statusLabel).map((s) => (
                <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant={onlyPending ? "default" : "outline"}
            className="h-8"
            onClick={() => setOnlyPending((v) => !v)}
          >
            Only pending
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground">
              <tr>
                <th className="text-left p-2">PO / Date</th>
                <th className="text-left p-2">Vendor</th>
                <th className="text-left p-2">Material</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Rate</th>
                <th className="text-left p-2">Due On</th>
                <th className="text-left p-2">Reached</th>
                <th className="text-right p-2">Recv Qty</th>
                <th className="text-right p-2">Delay</th>
                <th className="text-left p-2">Reference</th>
                <th className="text-left p-2">Gate Entry</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={13} className="py-8 text-center text-muted-foreground">No PO items match.</td></tr>
              ) : filtered.map((j) => {
                const g = j.grn;
                const status = g?.status || "pending";
                const delay = g?.delay_days ?? null;
                const gateBy = g?.gate_entry_by ? (profiles[g.gate_entry_by]?.email || profiles[g.gate_entry_by]?.full_name || "") : "";
                return (
                  <tr key={j.row.id} className="border-b last:border-0 align-top">
                    <td className="p-2">
                      <div className="font-medium">{j.po.po_number}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {(j.po.po_date || j.po.created_at || "").slice(0, 10)}
                      </div>
                      {j.row.lot_no && <div className="text-[10px] text-muted-foreground">Lot: {j.row.lot_no}</div>}
                    </td>
                    <td className="p-2">{j.po.vendor_name}</td>
                    <td className="p-2">
                      <div>{j.row.material}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {[j.row.size_model, j.row.make].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="p-2 text-right">{j.row.qty ?? 0} {j.row.unit || ""}</td>
                    <td className="p-2 text-right">{j.row.rate ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{j.row.due_on || "—"}</td>
                    <td className="p-2">
                      <Input
                        type="date"
                        className="h-7 text-[11px] px-2 w-[130px]"
                        value={g?.material_reached_date || ""}
                        onChange={(e) => upsertGrn(j, { material_reached_date: e.target.value || null })}
                      />
                      {!g?.material_reached_date && (
                        <Button
                          variant="link"
                          className="h-5 px-0 text-[10px]"
                          onClick={() => upsertGrn(j, { material_reached_date: todayIso() })}
                        >Today</Button>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        className="h-7 text-[11px] px-2 w-[80px] text-right"
                        placeholder="full"
                        value={g?.received_qty ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          upsertGrn(j, { received_qty: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {delay == null ? "—" : delay === 0 ? <span className="text-emerald-600">On time</span> : <span className="text-destructive font-medium">{delay}d</span>}
                    </td>
                    <td className="p-2 text-[10px] leading-tight">
                      {j.refs.cs.length > 0 && <div><b>CS:</b> {j.refs.cs.join(", ")}</div>}
                      {j.refs.oa.length > 0 && <div><b>OA:</b> {j.refs.oa.join(", ")}</div>}
                      {j.refs.boq.length > 0 && <div><b>BOQ:</b> {j.refs.boq.join(", ")}</div>}
                      {j.refs.req.length > 0 && <div><b>Req:</b> {j.refs.req.join(", ")}</div>}
                      {!j.refs.cs.length && !j.refs.oa.length && !j.refs.boq.length && !j.refs.req.length && "—"}
                    </td>
                    <td className="p-2">
                      {g?.gate_entry_done ? (
                        <div className="space-y-1">
                          <Badge className="bg-blue-600 hover:bg-blue-600 text-[10px]">
                            <PackageCheck className="h-3 w-3 mr-1" />Done
                          </Badge>
                          <div className="text-[10px] text-muted-foreground">
                            {g.gate_entry_at ? new Date(g.gate_entry_at).toLocaleString("en-IN") : ""}
                          </div>
                          {gateBy && <div className="text-[10px] text-muted-foreground">by {gateBy}</div>}
                          <Button size="sm" variant="ghost" className="h-5 px-1 text-[10px]" onClick={() => undoGateEntry(j)}>
                            <RotateCcw className="h-3 w-3 mr-1" />Undo
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => markGateEntry(j)}>
                          <PackageCheck className="h-3 w-3 mr-1" />Gate Entry
                        </Button>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge className={`${statusColor[status]} text-[10px]`}>{statusLabel[status]}</Badge>
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant={g?.late_comment ? "secondary" : "outline"}
                        className="h-7 text-[11px] px-2"
                        onClick={() => openComment(j)}
                        title={g?.late_comment || "Add comment"}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {g?.late_comment ? "Edit" : "Add"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!commentRow} onOpenChange={(o) => !o && setCommentRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Late material comment</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="text-muted-foreground">
              {commentRow?.po.po_number} · {commentRow?.row.material}
            </div>
            <Label>Reason / comment</Label>
            <Textarea rows={4} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="e.g. supplier delay, transport delay, quality hold…" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCommentRow(null)}>Close</Button>
            <Button size="sm" onClick={saveComment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
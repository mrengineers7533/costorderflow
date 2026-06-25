import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, FilePlus2, Columns3 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BoqRecord } from "@/lib/boq/types";
import type { OrderRecord } from "@/lib/orders/types";
import { CreateRequisitionDialog } from "@/components/manufacturing/CreateRequisitionDialog";
import type { RequisitionRecord } from "@/lib/requisition/types";
import { useColumnToggle } from "@/hooks/useColumnToggle";
import { buildMakeResolver } from "@/lib/boq/makeResolver";
import { EntityActivityBanner } from "@/components/activity/EntityActivityBanner";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";
import { NotSeenNotifBadge } from "@/components/notifications/NotSeenNotifBadge";

const fmtINR = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN") : "—";

export interface ModuleConfig {
  kind: "purchase" | "manufacturing";
  title: string;
  subtitle: string;
  basePath: string;
  futureSteps: string[];
}

/** Pick the latest approved BOQ per OA family (parent_order_id || id). */
function pickLatestApprovedPerFamily(boqs: BoqRecord[], orders: OrderRecord[]): BoqRecord[] {
  const familyOf = new Map<string, string>();
  for (const o of orders) familyOf.set(o.id, o.parent_order_id || o.id);
  const approved = boqs.filter(
    (b) => (b.verification_status ?? "approved") === "approved",
  );
  const byFamily = new Map<string, BoqRecord>();
  for (const b of approved) {
    const fam = familyOf.get(b.order_id) || b.order_id;
    const existing = byFamily.get(fam);
    if (!existing || (b.revision ?? 0) > (existing.revision ?? 0)) {
      byFamily.set(fam, b);
    }
  }
  return Array.from(byFamily.values()).sort((a, b) =>
    (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""),
  );
}

/** Pick latest BOQ (any status) per OA family. */
function pickLatestPerFamily(boqs: BoqRecord[], orders: OrderRecord[]): BoqRecord[] {
  const familyOf = new Map<string, string>();
  for (const o of orders) familyOf.set(o.id, o.parent_order_id || o.id);
  const byFamily = new Map<string, BoqRecord>();
  for (const b of boqs) {
    const fam = familyOf.get(b.order_id) || b.order_id;
    const existing = byFamily.get(fam);
    if (!existing || (b.revision ?? 0) > (existing.revision ?? 0)) {
      byFamily.set(fam, b);
    }
  }
  return Array.from(byFamily.values()).sort((a, b) =>
    (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""),
  );
}

/** Build a map: family-root id -> latest OA revision in that family. */
function buildLatestOaByFamily(orders: OrderRecord[]): Map<string, OrderRecord> {
  const m = new Map<string, OrderRecord>();
  for (const o of orders) {
    const fam = o.parent_order_id || o.id;
    const cur = m.get(fam);
    if (!cur || (o.revision ?? 0) > (cur.revision ?? 0)) m.set(fam, o);
  }
  return m;
}

function isOaApproved(o: OrderRecord | null | undefined): boolean {
  return !!o && o.status === "finalized";
}

export function ApprovedBoqListPage({ config }: { config: ModuleConfig }) {
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"MR" | "GMS">("MR");
  const [folder, setFolder] = useState<"approved" | "general">("approved");

  useEffect(() => {
    (async () => {
      const [b, o] = await Promise.all([
        supabase.from("boqs").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("*"),
      ]);
      setBoqs((b.data as unknown as BoqRecord[]) || []);
      setOrders((o.data as unknown as OrderRecord[]) || []);
      setLoading(false);
    })();
  }, []);

  const familyOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) m.set(o.id, o.parent_order_id || o.id);
    return m;
  }, [orders]);
  const latestOaByFamily = useMemo(() => buildLatestOaByFamily(orders), [orders]);

  const isManufacturing = config.kind === "manufacturing";

  // Approved pool: BOQ-approved AND (for manufacturing) latest OA also finalized.
  const approvedRows = useMemo(() => {
    const base = pickLatestApprovedPerFamily(boqs, orders);
    if (!isManufacturing) return base;
    return base.filter((b) => {
      const fam = familyOf.get(b.order_id) || b.order_id;
      return isOaApproved(latestOaByFamily.get(fam));
    });
  }, [boqs, orders, familyOf, latestOaByFamily, isManufacturing]);

  // General pool (Manufacturing only): everything else (latest BOQ per family not in approved pool).
  const generalRows = useMemo(() => {
    if (!isManufacturing) return [] as BoqRecord[];
    const approvedIds = new Set(approvedRows.map((b) => b.id));
    return pickLatestPerFamily(boqs, orders).filter((b) => !approvedIds.has(b.id));
  }, [boqs, orders, approvedRows, isManufacturing]);

  const rows = isManufacturing && folder === "general" ? generalRows : approvedRows;
  const folderCounts = { approved: approvedRows.length, general: generalRows.length };
  const counts = useMemo(() => {
    let mr = 0, gms = 0;
    for (const r of rows) (r.format === "MR" ? mr++ : gms++);
    return { MR: mr, GMS: gms };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byTab = rows.filter((b) => b.format === tab);
    if (!q) return byTab;
    return byTab.filter((b) =>
      [b.boq_number, b.client_name, b.reference_oa_number, b.project_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search, tab]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-xs text-muted-foreground">{config.subtitle}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search BOQ, OA, client…"
            className="h-8 pl-7 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "MR" | "GMS")}>
        <TabsList>
          <TabsTrigger value="MR">MR BOQs ({counts.MR})</TabsTrigger>
          <TabsTrigger value="GMS">GMS BOQs ({counts.GMS})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isManufacturing && (
        <Tabs value={folder} onValueChange={(v) => setFolder(v as "approved" | "general")}>
          <TabsList>
            <TabsTrigger value="approved">Approved BOQ ({folderCounts.approved})</TabsTrigger>
            <TabsTrigger value="general">General BOQ — Not Approved ({folderCounts.general})</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No approved {tab} BOQs available yet. Once a BOQ is approved, it will appear here automatically.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((b) => {
            const itemsCount = Array.isArray(b.line_items) ? b.line_items.length : 0;
            const rootId = familyOf.get(b.order_id) || b.order_id;
            const latestOa = latestOaByFamily.get(rootId);
            const oaApproved = isOaApproved(latestOa);
            const boqApproved = (b.verification_status ?? "approved") === "approved";
            const showApprovedBadge = isManufacturing ? (boqApproved && oaApproved) : boqApproved;
            return (
              <Card key={b.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{b.boq_number}</span>
                      <Badge variant="secondary">R{b.revision ?? 0}</Badge>
                      {showApprovedBadge ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>
                      ) : isManufacturing ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-400">
                          OA {latestOa ? (latestOa.status === "finalized" ? "Finalized" : "Draft") : "Pending"}
                        </Badge>
                      ) : null}
                      <NotSeenNotifBadge variant="cell" boqId={b.id} orderRootId={rootId} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {b.client_name || "—"} · OA {b.reference_oa_number || "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>Items: <span className="font-medium text-foreground">{itemsCount}</span></div>
                    <div>Approved: {fmtDate(b.verified_at || b.updated_at)}</div>
                  </div>
                  <Link to={`${config.basePath}/${b.id}`}>
                    <Button size="sm">Open</Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ApprovedBoqDetailPage({ config }: { config: ModuleConfig }) {
  const { boqId } = useParams<{ boqId: string }>();
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [reqs, setReqs] = useState<RequisitionRecord[]>([]);
  const [showMake, setShowMake] = useColumnToggle(`module.${config.kind}.boq.columns.make`, false);

  useEffect(() => {
    if (!boqId) return;
    (async () => {
      const { data } = await supabase.from("boqs").select("*").eq("id", boqId).maybeSingle();
      const b = (data as unknown as BoqRecord) || null;
      setBoq(b);
      const oaId = b?.source_order_id || b?.order_id;
      if (oaId) {
        const { data: o } = await supabase.from("orders").select("*").eq("id", oaId).maybeSingle();
        setOrder((o as unknown as OrderRecord) || null);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: r } = await sb.from("requisitions").select("*").eq("boq_id", boqId).order("created_at", { ascending: false });
      setReqs((r as RequisitionRecord[]) || []);
      setLoading(false);
    })();
  }, [boqId]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!boq) return <div className="p-6 text-sm text-muted-foreground">BOQ not found.</div>;

  const items = Array.isArray(boq.line_items) ? boq.line_items : [];
  const approved = (boq.verification_status ?? "approved") === "approved";
  const resolveMake = buildMakeResolver(order?.line_items);
  const orderRootId = order ? (order as { parent_order_id?: string | null; id: string }).parent_order_id || order.id : null;

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <EntityActivityBanner orderRootId={orderRootId} />
      {boqId && (
        <ModuleNotifications
          links={{ boqId, orderRootId: orderRootId ?? undefined }}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{config.title} · {boq.boq_number}</h1>
            {approved && <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>}
            <Badge variant="secondary">R{boq.revision ?? 0}</Badge>
            {boqId && (
              <NotSeenNotifBadge boqId={boqId} orderRootId={orderRootId ?? undefined} />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {boq.client_name || "—"} · OA {boq.reference_oa_number || "—"} · BOQ date {fmtDate(boq.boq_date)}
          </p>
        </div>
        <div className="flex gap-2">
          {config.kind === "manufacturing" && approved && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <FilePlus2 className="mr-1 h-4 w-4" /> Create Requisition
            </Button>
          )}
          <Link to={config.basePath}>
            <Button variant="outline" size="sm">Back</Button>
          </Link>
        </div>
      </div>

      {reqs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">
            {config.kind === "purchase" ? "Incoming requisitions" : "Linked requisitions"}
          </CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {reqs.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <span className="font-medium">{r.requisition_number}</span>{" "}
                  <Badge variant="secondary" className="ml-1">BOQ R{r.boq_revision}</Badge>{" "}
                  <Badge className="ml-1">{r.status}</Badge>
                </div>
                <Link to={`/requisitions/${r.id}`}><Button size="sm" variant="outline">Open</Button></Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">Approved BOQ items (read-only)</CardTitle>
          <Button
            type="button"
            variant={showMake ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowMake(!showMake)}
          >
            <Columns3 className="h-4 w-4" />
            {showMake ? "Hide Make" : "Show Make"}
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">#</th>
                <th className="text-left py-2 pr-3">Description</th>
                <th className="text-left py-2 pr-3">Model</th>
                {showMake && <th className="text-left py-2 pr-3">Make</th>}
                <th className="text-right py-2 pr-3">Qty</th>
                <th className="text-left py-2 pr-3">Unit</th>
                <th className="text-left py-2 pr-3">Remarks</th>
                <th className="text-left py-2 pr-3">Motor</th>
                <th className="text-right py-2 pr-3">Motor Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={showMake ? 9 : 8} className="py-4 text-center text-muted-foreground">No line items.</td></tr>
              ) : items.map((it, idx) => (
                <tr key={it.id || idx} className="border-b last:border-0">
                  <td className="py-2 pr-3">{it.item_no || idx + 1}</td>
                  <td className="py-2 pr-3">{it.description}</td>
                  <td className="py-2 pr-3">{it.model_number}</td>
                  {showMake && <td className="py-2 pr-3">{resolveMake(it, idx) || "—"}</td>}
                  <td className="py-2 pr-3 text-right">{it.quantity}</td>
                  <td className="py-2 pr-3">{it.unit}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{it.remarks}</td>
                  <td className="py-2 pr-3">{it.motor || "—"}</td>
                  <td className="py-2 pr-3 text-right">{it.motor_quantity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upcoming {config.kind === "purchase" ? "Purchase" : "Manufacturing"} workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.futureSteps.map((step) => (
              <div
                key={step}
                className="rounded-md border border-dashed p-3 text-sm text-muted-foreground bg-muted/30"
              >
                <div className="font-medium text-foreground">{step}</div>
                <div className="text-xs mt-1">Coming soon</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {config.kind === "manufacturing" && (
        <CreateRequisitionDialog open={createOpen} onOpenChange={setCreateOpen} boq={boq} />
      )}
    </div>
  );
}

export const PURCHASE_CONFIG: ModuleConfig = {
  kind: "purchase",
  title: "Purchase",
  subtitle: "Approved BOQs ready for purchase workflow.",
  basePath: "/purchase",
  futureSteps: [
    "Raw Material Mapping",
    "Requisition",
    "Lot Marking",
    "PI Linkage",
    "Invoice",
    "Dispatch",
  ],
};

export const MANUFACTURING_CONFIG: ModuleConfig = {
  kind: "manufacturing",
  title: "Manufacturing",
  subtitle: "Approved BOQs ready for manufacturing workflow.",
  basePath: "/manufacturing",
  futureSteps: [
    "Raw Material Mapping",
    "Requisition",
    "Lot Marking",
    "Manufacturing Planning",
    "PI Linkage",
    "Invoice",
    "Dispatch",
  ],
};
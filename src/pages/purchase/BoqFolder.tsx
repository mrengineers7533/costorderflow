import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import type { BoqRecord } from "@/lib/boq/types";
import type { OrderRecord } from "@/lib/orders/types";
import { NotSeenNotifBadge } from "@/components/notifications/NotSeenNotifBadge";

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-IN") : "—";

function pickLatestApprovedPerFamily(boqs: BoqRecord[], orders: OrderRecord[]): BoqRecord[] {
  const familyOf = new Map<string, string>();
  for (const o of orders) familyOf.set(o.id, o.parent_order_id || o.id);
  const approved = boqs.filter((b) => {
    if ((b.verification_status ?? "approved") !== "approved") return false;
    const drs = (b as unknown as { design_review_status?: string | null }).design_review_status;
    return drs === "design_approved" || drs === "final_sent";
  });
  const byFamily = new Map<string, BoqRecord>();
  for (const b of approved) {
    const fam = familyOf.get(b.order_id) || b.order_id;
    const existing = byFamily.get(fam);
    if (!existing || (b.revision ?? 0) > (existing.revision ?? 0)) byFamily.set(fam, b);
  }
  return Array.from(byFamily.values()).sort((a, b) =>
    (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""),
  );
}

export default function BoqFolder() {
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"MR" | "GMS">("MR");

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

  const rows = useMemo(() => pickLatestApprovedPerFamily(boqs, orders), [boqs, orders]);
  const orderFormatById = useMemo(() => {
    const m = new Map<string, "MR" | "GMS">();
    for (const o of orders) m.set(o.id, o.format);
    return m;
  }, [orders]);
  const familyOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) m.set(o.id, o.parent_order_id || o.id);
    return m;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((b) => orderFormatById.get(b.order_id) === tab)
      .filter((b) =>
        !q
          ? true
          : [b.boq_number, b.client_name, b.reference_oa_number, b.project_number]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [rows, orderFormatById, tab, search]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">BOQ Folder</h1>
          <p className="text-xs text-muted-foreground">Approved BOQs grouped by order format.</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search BOQ, OA, client…"
              className="h-8 pl-7 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link to="/purchase"><Button size="sm" variant="outline">Back</Button></Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "MR" | "GMS")}>
        <TabsList>
          <TabsTrigger value="MR">MR BOQ</TabsTrigger>
          <TabsTrigger value="GMS">GMS BOQ</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No approved {tab} BOQs yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filtered.map((b) => {
                const itemsCount = Array.isArray(b.line_items) ? b.line_items.length : 0;
                const rootId = familyOf.get(b.order_id) || b.order_id;
                return (
                  <Card key={b.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-4 flex flex-wrap items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{b.boq_number}</span>
                          <Badge variant="secondary">R{b.revision ?? 0}</Badge>
                          <Badge className="bg-emerald-600 hover:bg-emerald-600">{tab}</Badge>
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
                      <Link to={`/purchase/${b.id}`}><Button size="sm">Open</Button></Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
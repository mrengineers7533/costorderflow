import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { IndianRupee, FileText, ClipboardList, Receipt, GitBranch, Search, Eye, EyeOff } from "lucide-react";
import type { OrderRecord, LineItem } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { PiRecord } from "@/lib/pi/types";

const fmtINR = (n: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--accent-foreground))", "hsl(var(--destructive))"];

interface FamilyRow {
  rootId: string;
  company: string;
  originalOa: string;
  currentOa: string;
  revisedOa: string | null;
  revisionCount: number;
  orderDate: string;
  orderValue: number;
  status: string;
  format: string;
  boqs: BoqRecord[];
  totalBoqItems: number;
  pis: PiRecord[];
  itemsWithPi: number;
  itemsPendingPi: number;
  piNumbers: string;
  piValue: number;
  pendingValue: number;
}

export default function FlowReport() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [pis, setPis] = useState<PiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [o, b, p] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("boqs").select("*").order("created_at", { ascending: false }),
        supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
      ]);
      setOrders((o.data as unknown as OrderRecord[]) || []);
      setBoqs((b.data as unknown as BoqRecord[]) || []);
      setPis((p.data as unknown as PiRecord[]) || []);
      setLoading(false);
    })();
  }, []);

  const families: FamilyRow[] = useMemo(() => {
    // Group orders by family root
    const byRoot = new Map<string, OrderRecord[]>();
    for (const o of orders) {
      const root = o.parent_order_id || o.id;
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root)!.push(o);
    }

    const piByOaId = new Map<string, PiRecord[]>();
    for (const p of pis) {
      if (!p.reference_oa_id) continue;
      if (!piByOaId.has(p.reference_oa_id)) piByOaId.set(p.reference_oa_id, []);
      piByOaId.get(p.reference_oa_id)!.push(p);
    }

    const rows: FamilyRow[] = [];
    for (const [rootId, fam] of byRoot.entries()) {
      const sorted = [...fam].sort((a, b) => (a.revision || 0) - (b.revision || 0));
      const original = sorted[0];
      const current = sorted.find((o) => o.is_current !== false) || sorted[sorted.length - 1];
      const familyOaIds = new Set(sorted.map((o) => o.id));

      // BOQs across all revisions of this OA family
      const famBoqs = boqs.filter((bq) => familyOaIds.has(bq.order_id));
      const totalBoqItems = famBoqs
        .filter((bq) => bq.is_current !== false)
        .reduce((s, bq) => s + (Array.isArray(bq.line_items) ? bq.line_items.length : 0), 0);

      // PIs across all revisions; filter current only for "with PI" set
      const famPis: PiRecord[] = [];
      for (const oa of sorted) famPis.push(...(piByOaId.get(oa.id) || []));
      const currentPis = famPis.filter((p) => p.is_current !== false);

      const itemsWithPi = new Set<string>();
      for (const pi of currentPis) {
        for (const it of (pi.line_items as LineItem[] | null) || []) {
          if (it?.id) itemsWithPi.add(it.id);
        }
      }
      const currentLineItems = (current.line_items as LineItem[] | null) || [];
      const totalItems = currentLineItems.length;
      const withPi = currentLineItems.filter((it) => itemsWithPi.has(it.id)).length;
      const pendingItems = currentLineItems.filter((it) => !itemsWithPi.has(it.id));
      const pendingPiCount = pendingItems.length;
      const pendingValue = pendingItems.reduce((s, it) => s + (it.amount || 0), 0);

      const piValue = currentPis.reduce((s, p) => s + (p.totals?.net_payable || 0), 0);

      rows.push({
        rootId,
        company: current.company_name || current.bill_to?.name || "—",
        originalOa: original.oa_number,
        currentOa: current.oa_number,
        revisedOa: (current.revision || 0) > 0 ? current.oa_number : null,
        revisionCount: Math.max(0, sorted.length - 1),
        orderDate: current.order_date,
        orderValue: current.totals?.net_payable || 0,
        status: current.status,
        format: current.format,
        boqs: famBoqs.filter((bq) => bq.is_current !== false),
        totalBoqItems: totalBoqItems || totalItems,
        pis: currentPis,
        itemsWithPi: withPi,
        itemsPendingPi: pendingPiCount,
        piNumbers: currentPis.map((p) => p.pi_number).join(", "),
        piValue,
        pendingValue,
      });
    }
    rows.sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));
    return rows;
  }, [orders, boqs, pis]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter((r) =>
      [r.company, r.currentOa, r.originalOa, r.piNumbers].join(" ").toLowerCase().includes(q),
    );
  }, [families, search]);

  const summary = useMemo(() => {
    const totalOrders = families.length;
    const revisedOrders = families.filter((f) => f.revisionCount > 0).length;
    const totalOrderValue = families.reduce((s, f) => s + f.orderValue, 0);
    const totalBoqs = boqs.filter((b) => b.is_current !== false).length;
    const totalPis = pis.filter((p) => p.is_current !== false).length;
    const totalPiValue = families.reduce((s, f) => s + f.piValue, 0);
    const totalPendingValue = families.reduce((s, f) => s + f.pendingValue, 0);
    const itemsWithPi = families.reduce((s, f) => s + f.itemsWithPi, 0);
    const itemsPendingPi = families.reduce((s, f) => s + f.itemsPendingPi, 0);
    return {
      totalOrders, revisedOrders, totalOrderValue,
      totalBoqs, totalPis, totalPiValue, totalPendingValue,
      itemsWithPi, itemsPendingPi,
    };
  }, [families, boqs, pis]);

  const companyData = useMemo(() => {
    const m = new Map<string, { company: string; count: number; value: number; pending: number }>();
    for (const f of families) {
      const k = f.company || "—";
      const e = m.get(k) || { company: k, count: 0, value: 0, pending: 0 };
      e.count += 1;
      e.value += f.orderValue;
      e.pending += f.pendingValue;
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [families]);

  const piPieData = [
    { name: "Items with PI", value: summary.itemsWithPi },
    { name: "Items pending PI", value: summary.itemsPendingPi },
  ];

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">OA → BOQ → PI Flow Report</h1>
          <p className="text-xs text-muted-foreground">End-to-end view across all order families.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search company, OA, PI…"
              className="h-8 pl-7 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowDetail((s) => !s)}>
            {showDetail ? <><EyeOff className="h-3.5 w-3.5 mr-1" />Hide Detailed Report</> : <><Eye className="h-3.5 w-3.5 mr-1" />Show Detailed Report</>}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<FileText className="h-4 w-4" />} label="Total Orders" value={summary.totalOrders.toString()} sub={`${summary.revisedOrders} revised`} />
        <SummaryCard icon={<IndianRupee className="h-4 w-4" />} label="Total Order Value" value={fmtINR(summary.totalOrderValue)} />
        <SummaryCard icon={<ClipboardList className="h-4 w-4" />} label="BOQs Created" value={summary.totalBoqs.toString()} />
        <SummaryCard icon={<Receipt className="h-4 w-4" />} label="PIs Created" value={summary.totalPis.toString()} sub={`${fmtINR(summary.totalPiValue)} total`} />
        <SummaryCard icon={<GitBranch className="h-4 w-4" />} label="Items with PI" value={summary.itemsWithPi.toString()} />
        <SummaryCard icon={<GitBranch className="h-4 w-4" />} label="Items Pending PI" value={summary.itemsPendingPi.toString()} />
        <SummaryCard icon={<IndianRupee className="h-4 w-4" />} label="PI Value" value={fmtINR(summary.totalPiValue)} />
        <SummaryCard icon={<IndianRupee className="h-4 w-4" />} label="Pending PI Value" value={fmtINR(summary.totalPendingValue)} />
      </div>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Company-wise Order Value</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="company" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
                <Tooltip formatter={(v: number) => fmtINR(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" name="Order Value" fill="hsl(var(--primary))" />
                <Bar dataKey="pending" name="Pending PI Value" fill="hsl(var(--muted-foreground))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Items: PI Created vs Pending</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={piPieData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {piPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revised OA mapping */}
      {families.some((f) => f.revisionCount > 0) && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revised OAs ↔ Original</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original OA</TableHead>
                  <TableHead>Current Revised OA</TableHead>
                  <TableHead>Revisions</TableHead>
                  <TableHead>Company</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {families.filter((f) => f.revisionCount > 0).map((f) => (
                  <TableRow key={f.rootId}>
                    <TableCell className="font-mono text-xs">{f.originalOa}</TableCell>
                    <TableCell className="font-mono text-xs">{f.currentOa}</TableCell>
                    <TableCell><Badge variant="secondary">R{f.revisionCount}</Badge></TableCell>
                    <TableCell className="text-sm">{f.company}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detailed report */}
      {showDetail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detailed Flow ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No records.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>OA No.</TableHead>
                    <TableHead>Original OA</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Order Value</TableHead>
                    <TableHead>BOQ</TableHead>
                    <TableHead className="text-right">BOQ Items</TableHead>
                    <TableHead className="text-right">PI Items</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>PI No.</TableHead>
                    <TableHead className="text-right">PI Value</TableHead>
                    <TableHead className="text-right">Pending Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => (
                    <TableRow key={f.rootId}>
                      <TableCell className="text-sm">{f.company}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link to={`/orders/${f.rootId}`} className="hover:underline">{f.currentOa}</Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {f.revisionCount > 0 ? f.originalOa : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{f.orderDate ? new Date(f.orderDate).toLocaleDateString("en-IN") : "—"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtINR(f.orderValue)}</TableCell>
                      <TableCell className="text-xs">
                        {f.boqs.length === 0 ? <Badge variant="outline">None</Badge> : (
                          <span className="font-mono">{f.boqs.map((b) => b.boq_number).join(", ")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.totalBoqItems}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.itemsWithPi}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.itemsPendingPi > 0
                          ? <Badge variant="destructive">{f.itemsPendingPi}</Badge>
                          : <Badge variant="secondary">0</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate" title={f.piNumbers}>
                        {f.piNumbers || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtINR(f.piValue)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{fmtINR(f.pendingValue)}</TableCell>
                      <TableCell>
                        <Badge variant={f.itemsPendingPi === 0 && f.pis.length > 0 ? "default" : "secondary"}>
                          {f.itemsPendingPi === 0 && f.pis.length > 0 ? "Complete" : f.pis.length === 0 ? "No PI" : "Partial"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted">{icon}</div>
          <span className="text-[10px] uppercase tracking-wider">{label}</span>
        </div>
        <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
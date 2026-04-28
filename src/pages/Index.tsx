import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText, FilePlus2, Upload, Sparkles,
  ArrowRight, ArrowUpRight, ListChecks, Clock, CheckCircle2,
  TrendingUp, IndianRupee, Building2, Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";

type Stats = {
  total: number;
  drafts: number;
  finalized: number;
  thisMonth: number;
  mr: number;
  gms: number;
  totalValue: number;
};

const Index = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as unknown as OrderRecord[]) || []);
        setLoading(false);
      });
  }, []);

  const stats: Stats = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return {
      total: orders.length,
      drafts: orders.filter((o) => o.status === "draft").length,
      finalized: orders.filter((o) => o.status === "finalized").length,
      thisMonth: orders.filter((o) => {
        const d = new Date(o.created_at || o.order_date);
        return d.getMonth() === month && d.getFullYear() === year;
      }).length,
      mr: orders.filter((o) => o.format === "MR").length,
      gms: orders.filter((o) => o.format === "GMS").length,
      totalValue: orders.reduce((s, o) => s + (o.totals?.net_payable || 0), 0),
    };
  }, [orders]);

  const recent = orders.slice(0, 5);
  const mrPct = stats.total ? Math.round((stats.mr / stats.total) * 100) : 0;
  const gmsPct = stats.total ? 100 - mrPct : 0;

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your order acceptances, drafts, and total value at a glance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg">
              <Link to="/orders"><FileText className="mr-1.5 h-4 w-4" />View Orders</Link>
            </Button>
            <Button asChild className="rounded-lg">
              <Link to="/orders/new"><FilePlus2 className="mr-1.5 h-4 w-4" />New OA</Link>
            </Button>
          </div>
        </div>

        {/* Hero stat strip */}
        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Total value highlight card */}
          <Card className="relative overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" aria-hidden />
            <CardContent className="relative p-6 lg:p-8">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
                <TrendingUp className="h-3.5 w-3.5" />
                Total Order Value
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <IndianRupee className="h-7 w-7 text-foreground/70" />
                <span className="text-4xl lg:text-5xl font-semibold tracking-tight tabular-nums">
                  {stats.totalValue.toLocaleString("en-IN")}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Across {stats.total} order{stats.total === 1 ? "" : "s"} — {stats.finalized} finalized, {stats.drafts} draft.
              </p>

              {/* Format split */}
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Format split</span>
                  <span className="font-medium">MR {mrPct}% · GMS {gmsPct}%</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div className="bg-primary" style={{ width: `${mrPct}%` }} />
                  <div className="bg-primary/40" style={{ width: `${gmsPct}%` }} />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />MR · {stats.mr}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary/40" />GMS · {stats.gms}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stat tiles */}
          <div className="grid grid-cols-2 gap-4">
            <StatTile icon={<ListChecks className="h-4 w-4" />} label="Total OAs" value={stats.total} />
            <StatTile icon={<Calendar className="h-4 w-4" />} label="This Month" value={stats.thisMonth} accent />
            <StatTile icon={<Clock className="h-4 w-4" />} label="Drafts" value={stats.drafts} />
            <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Finalized" value={stats.finalized} />
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Quick actions</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <ActionCard
              icon={<Upload className="h-5 w-5" />}
              badge={<span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"><Sparkles className="h-3 w-3" />AI</span>}
              title="Upload Cost Sheet"
              desc="Drop a PDF and let AI fill the order details."
              to="/orders/new"
              accent
            />
            <ActionCard
              icon={<FilePlus2 className="h-5 w-5" />}
              title="New Blank Order"
              desc="Build an OA manually from scratch."
              to="/orders/new"
            />
            <ActionCard
              icon={<FileText className="h-5 w-5" />}
              title="Browse Orders"
              desc="View drafts, finalized OAs and history."
              to="/orders"
            />
          </div>
        </section>

        {/* Recent orders */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Recent orders</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders">View all<ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </div>
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : recent.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FilePlus2 className="h-5 w-5" />
                  </div>
                  <p className="mt-3 font-medium">No orders yet</p>
                  <p className="text-sm text-muted-foreground">Create your first OA to see it here.</p>
                  <Button className="mt-4 rounded-lg" asChild>
                    <Link to="/orders/new">Create your first OA</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border/70">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="group flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium truncate">{o.oa_number}</span>
                              <Badge
                                variant={o.format === "MR" ? "default" : "secondary"}
                                className="rounded-full px-2 py-0 text-[10px] font-semibold"
                              >
                                {o.format}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {o.company_name || o.bill_to?.name || "—"} · {new Date(o.order_date).toLocaleDateString("en-IN")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold tabular-nums">
                            ₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}
                          </span>
                          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${o.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                            {o.status}
                          </span>
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

function StatTile({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <Card className={`rounded-xl shadow-sm transition-shadow hover:shadow-md ${accent ? "border-primary/30 bg-primary/5" : "border-border/70"}`}>
      <CardContent className="p-5">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-tight tabular-nums mt-1">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  icon, title, desc, to, accent, badge,
}: { icon: React.ReactNode; title: string; desc: string; to: string; accent?: boolean; badge?: React.ReactNode }) {
  return (
    <Link to={to} className="group">
      <Card className={`h-full rounded-xl shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-0.5 ${accent ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent" : "border-border/70"}`}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {icon}
            </div>
            {badge}
          </div>
          <div>
            <div className="font-semibold">{title}</div>
            <p className="text-sm text-muted-foreground mt-1">{desc}</p>
          </div>
          <div className="flex items-center text-sm font-medium text-primary pt-1 gap-1 group-hover:gap-2 transition-all">
            Open<ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default Index;

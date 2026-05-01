import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, FilePlus2, Upload, Sparkles,
  ArrowRight, ArrowUpRight, ListChecks, Clock, CheckCircle2,
  TrendingUp, IndianRupee, Building2, Calendar,
  ClipboardList, Receipt, Layers, GitBranch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";
import type { BoqRecord } from "@/lib/boq/types";
import type { PiRecord } from "@/lib/pi/types";

type Tone = "oa" | "boq" | "pi";

function isThisMonth(d: string | undefined | null) {
  if (!d) return false;
  const date = new Date(d);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

const Index = () => {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [boqs, setBoqs] = useState<BoqRecord[]>([]);
  const [pis, setPis] = useState<PiRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [ordersRes, boqsRes, pisRes] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("boqs").select("*").order("created_at", { ascending: false }),
        supabase.from("proforma_invoices").select("*").order("created_at", { ascending: false }),
      ]);
      setOrders((ordersRes.data as unknown as OrderRecord[]) || []);
      setBoqs((boqsRes.data as unknown as BoqRecord[]) || []);
      setPis((pisRes.data as unknown as PiRecord[]) || []);
      setLoading(false);
    })();
  }, []);

  const oaStats = useMemo(() => {
    const cur = orders.filter((o) => o.is_current !== false);
    return {
      total: cur.length,
      drafts: cur.filter((o) => o.status === "draft").length,
      finalized: cur.filter((o) => o.status === "finalized").length,
      thisMonth: cur.filter((o) => isThisMonth(o.created_at || o.order_date)).length,
      mr: cur.filter((o) => o.format === "MR").length,
      gms: cur.filter((o) => o.format === "GMS").length,
      totalValue: cur.reduce((s, o) => s + (o.totals?.net_payable || 0), 0),
    };
  }, [orders]);

  const boqStats = useMemo(() => {
    const cur = boqs.filter((b) => b.is_current !== false);
    return {
      total: boqs.length,
      currentRevs: cur.length,
      thisMonth: cur.filter((b) => isThisMonth(b.created_at || b.boq_date)).length,
      totalLineItems: cur.reduce((s, b) => s + (Array.isArray(b.line_items) ? b.line_items.length : 0), 0),
      mr: cur.filter((b) => b.format === "MR").length,
      gms: cur.filter((b) => b.format === "GMS").length,
    };
  }, [boqs]);

  const piStats = useMemo(() => {
    const cur = pis.filter((p) => p.is_current !== false);
    return {
      total: cur.length,
      drafts: cur.filter((p) => p.status === "draft").length,
      finalized: cur.filter((p) => p.status === "finalized").length,
      thisMonth: cur.filter((p) => isThisMonth(p.created_at || p.pi_date)).length,
      mr: cur.filter((p) => p.format === "MR").length,
      gms: cur.filter((p) => p.format === "GMS").length,
      totalValue: cur.reduce((s, p) => s + (p.totals?.net_payable || 0), 0),
    };
  }, [pis]);

  const recentOas = orders.slice(0, 5);
  const recentBoqs = boqs.slice(0, 5);
  const recentPis = pis.slice(0, 5);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 lg:px-6 py-5 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Overview across Order Acceptances, BOQs, and Proforma Invoices.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg h-8">
              <Link to="/orders"><FileText className="mr-1 h-3.5 w-3.5" />OAs</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg h-8">
              <Link to="/boqs"><ClipboardList className="mr-1 h-3.5 w-3.5" />BOQs</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg h-8">
              <Link to="/pi"><Receipt className="mr-1 h-3.5 w-3.5" />PIs</Link>
            </Button>
            <Button asChild size="sm" className="rounded-lg h-8">
              <Link to="/orders/new"><FilePlus2 className="mr-1 h-3.5 w-3.5" />New OA</Link>
            </Button>
          </div>
        </div>

        {/* Hero strip */}
        <section className="grid gap-3 lg:grid-cols-2">
          <ValueHero
            label="Total OA Value"
            value={oaStats.totalValue}
            countLine={`Across ${oaStats.total} OA${oaStats.total === 1 ? "" : "s"} — ${oaStats.finalized} finalized, ${oaStats.drafts} draft.`}
            mr={oaStats.mr}
            gms={oaStats.gms}
          />
          <ValueHero
            label="Total PI Value"
            value={piStats.totalValue}
            countLine={`Across ${piStats.total} PI${piStats.total === 1 ? "" : "s"} — ${piStats.finalized} finalized, ${piStats.drafts} draft.`}
            mr={piStats.mr}
            gms={piStats.gms}
          />
        </section>

        {/* Module stat tiles */}
        <section className="space-y-3">
          <ModuleRow
            tone="oa"
            heading="Order Acceptances"
            href="/orders"
            tiles={[
              { icon: <ListChecks className="h-4 w-4" />, label: "Total OAs", value: oaStats.total },
              { icon: <Calendar className="h-4 w-4" />, label: "This Month", value: oaStats.thisMonth },
              { icon: <Clock className="h-4 w-4" />, label: "Drafts", value: oaStats.drafts },
              { icon: <CheckCircle2 className="h-4 w-4" />, label: "Finalized", value: oaStats.finalized },
            ]}
          />
          <ModuleRow
            tone="boq"
            heading="BOQs"
            href="/boqs"
            tiles={[
              { icon: <ClipboardList className="h-4 w-4" />, label: "Total BOQs", value: boqStats.total },
              { icon: <Calendar className="h-4 w-4" />, label: "This Month", value: boqStats.thisMonth },
              { icon: <GitBranch className="h-4 w-4" />, label: "Current Revs", value: boqStats.currentRevs },
              { icon: <Layers className="h-4 w-4" />, label: "Line Items", value: boqStats.totalLineItems },
            ]}
          />
          <ModuleRow
            tone="pi"
            heading="Proforma Invoices"
            href="/pi"
            tiles={[
              { icon: <Receipt className="h-4 w-4" />, label: "Total PIs", value: piStats.total },
              { icon: <Calendar className="h-4 w-4" />, label: "This Month", value: piStats.thisMonth },
              { icon: <Clock className="h-4 w-4" />, label: "Drafts", value: piStats.drafts },
              { icon: <CheckCircle2 className="h-4 w-4" />, label: "Finalized", value: piStats.finalized },
            ]}
          />
        </section>

        {/* Quick actions */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard
              icon={<Upload className="h-5 w-5" />}
              badge={<span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"><Sparkles className="h-3 w-3" />AI</span>}
              title="Upload Cost Sheet"
              desc="Drop a PDF and let AI fill the OA."
              to="/orders/new"
              accent
            />
            <ActionCard
              icon={<FilePlus2 className="h-5 w-5" />}
              title="New Blank OA"
              desc="Build an OA manually from scratch."
              to="/orders/new/edit"
            />
            <ActionCard
              icon={<ClipboardList className="h-5 w-5" />}
              title="Browse BOQs"
              desc="View BOQs and revisions across OAs."
              to="/boqs"
            />
            <ActionCard
              icon={<Receipt className="h-5 w-5" />}
              title="Browse PIs"
              desc="Open Proforma Invoices and revisions."
              to="/pi"
            />
          </div>
        </section>

        {/* Recent activity (tabbed) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent activity</h2>
          </div>
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="p-0">
              <Tabs defaultValue="oa" className="w-full">
                <div className="px-4 pt-4">
                  <TabsList>
                    <TabsTrigger value="oa">Recent OAs</TabsTrigger>
                    <TabsTrigger value="boq">Recent BOQs</TabsTrigger>
                    <TabsTrigger value="pi">Recent PIs</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="oa" className="m-0">
                  {loading ? (
                    <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                  ) : recentOas.length === 0 ? (
                    <EmptyState
                      icon={<FilePlus2 className="h-5 w-5" />}
                      title="No OAs yet"
                      desc="Create your first OA to see it here."
                      ctaLabel="Create OA"
                      ctaTo="/orders/new"
                    />
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {recentOas.map((o) => (
                        <RecentRow
                          key={o.id}
                          to={`/orders/${o.id}`}
                          title={o.oa_number}
                          format={o.format}
                          subtitle={`${o.company_name || o.bill_to?.name || "—"} · ${new Date(o.order_date).toLocaleDateString("en-IN")}`}
                          amount={o.totals?.net_payable || 0}
                          status={o.status}
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="boq" className="m-0">
                  {loading ? (
                    <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                  ) : recentBoqs.length === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-5 w-5" />}
                      title="No BOQs yet"
                      desc="Generate a BOQ from an OA to see it here."
                      ctaLabel="Browse OAs"
                      ctaTo="/orders"
                    />
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {recentBoqs.map((b) => (
                        <RecentRow
                          key={b.id}
                          to={`/boqs/${b.id}`}
                          title={b.boq_number}
                          format={b.format}
                          subtitle={`Ref OA: ${b.reference_oa_number || "—"} · ${new Date(b.boq_date).toLocaleDateString("en-IN")}`}
                          revision={b.revision}
                          isCurrent={b.is_current}
                          status={b.status}
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="pi" className="m-0">
                  {loading ? (
                    <p className="p-6 text-sm text-muted-foreground">Loading…</p>
                  ) : recentPis.length === 0 ? (
                    <EmptyState
                      icon={<Receipt className="h-5 w-5" />}
                      title="No PIs yet"
                      desc="Create a PI from an OA to see it here."
                      ctaLabel="Browse PIs"
                      ctaTo="/pi"
                    />
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {recentPis.map((p) => (
                        <RecentRow
                          key={p.id}
                          to={`/pi/${p.id}`}
                          title={p.pi_number}
                          format={p.format}
                          subtitle={`${p.company_name || p.bill_to?.name || "—"} · Ref OA: ${p.reference_oa_number || "—"} · ${new Date(p.pi_date).toLocaleDateString("en-IN")}`}
                          amount={p.totals?.net_payable || 0}
                          revision={p.revision}
                          isCurrent={p.is_current}
                          status={p.status}
                        />
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

function ValueHero({
  label, value, countLine, mr, gms,
}: { label: string; value: number; countLine: string; mr: number; gms: number }) {
  const total = mr + gms;
  const mrPct = total ? Math.round((mr / total) * 100) : 0;
  const gmsPct = total ? 100 - mrPct : 0;
  return (
    <Card className="relative overflow-hidden rounded-xl border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <CardContent className="relative p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          <TrendingUp className="h-3 w-3" />
          {label}
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <IndianRupee className="h-5 w-5 text-foreground/70" />
          <span className="text-2xl lg:text-3xl font-semibold tracking-tight tabular-nums">
            {value.toLocaleString("en-IN")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{countLine}</p>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Format split</span>
            <span className="font-medium">MR {mrPct}% · GMS {gmsPct}%</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${mrPct}%` }} />
            <div className="bg-primary/40" style={{ width: `${gmsPct}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" />MR · {mr}</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary/40" />GMS · {gms}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleRow({
  tone, heading, href, tiles,
}: {
  tone: Tone;
  heading: string;
  href: string;
  tiles: { icon: React.ReactNode; label: string; value: number }[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</h2>
        <Button variant="ghost" size="sm" asChild className="h-6 px-1.5 text-[11px]">
          <Link to={href}>View all<ArrowRight className="h-3 w-3 ml-0.5" /></Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {tiles.map((t, i) => <StatTile key={i} icon={t.icon} label={t.label} value={t.value} tone={tone} accent={i === 1} />)}
      </div>
    </div>
  );
}

function StatTile({
  icon, label, value, accent, tone,
}: { icon: React.ReactNode; label: string; value: number; accent?: boolean; tone?: Tone }) {
  const toneBorder =
    tone === "boq" ? "border-l-4 border-l-primary/50" :
    tone === "pi"  ? "border-l-4 border-l-primary/80" :
    tone === "oa"  ? "border-l-4 border-l-primary" :
    "";
  return (
    <Card className={`rounded-xl shadow-sm transition-shadow hover:shadow-md ${accent ? "border-primary/30 bg-primary/5" : "border-border/70"} ${toneBorder}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {icon}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        </div>
        <div className="text-xl font-semibold leading-tight tabular-nums mt-1.5">{value.toLocaleString("en-IN")}</div>
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
        <CardContent className="p-3.5 space-y-2">
          <div className="flex items-start justify-between">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {icon}
            </div>
            {badge}
          </div>
          <div>
            <div className="font-semibold text-sm">{title}</div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>
          </div>
          <div className="flex items-center text-xs font-medium text-primary pt-0.5 gap-1 group-hover:gap-2 transition-all">
            Open<ArrowRight className="h-3.5 w-3.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RecentRow({
  to, title, format, subtitle, amount, status, revision, isCurrent,
}: {
  to: string;
  title: string;
  format: "MR" | "GMS";
  subtitle: string;
  amount?: number;
  status?: string;
  revision?: number;
  isCurrent?: boolean;
}) {
  return (
    <li>
      <Link to={to} className="group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
            <Building2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-medium truncate">{title}</span>
              <Badge variant={format === "MR" ? "default" : "secondary"} className="rounded-full px-1.5 py-0 text-[9px] font-semibold">
                {format}
              </Badge>
              {typeof revision === "number" && (
                <span className="font-mono text-[9px] px-1 py-0 rounded bg-muted text-muted-foreground">R{revision}</span>
              )}
              {isCurrent === false && (
                <Badge variant="outline" className="text-[8px] uppercase px-1 py-0">Superseded</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {typeof amount === "number" && (
            <span className="text-xs font-semibold tabular-nums">
              ₹ {amount.toLocaleString("en-IN")}
            </span>
          )}
          {status && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0 text-[10px] capitalize text-muted-foreground">
              <span className={`h-1 w-1 rounded-full ${status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
              {status}
            </span>
          )}
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </Link>
    </li>
  );
}

function EmptyState({
  icon, title, desc, ctaLabel, ctaTo,
}: { icon: React.ReactNode; title: string; desc: string; ctaLabel: string; ctaTo: string }) {
  return (
    <div className="p-6 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="mt-2 font-medium text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <Button size="sm" className="mt-3 rounded-lg" asChild>
        <Link to={ctaTo}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

export default Index;
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText, FilePlus2, Upload, Sparkles,
  Eye, Download, ArrowRight, ListChecks, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";

const Index = () => {
  const [recent, setRecent] = useState<OrderRecord[]>([]);
  const [stats, setStats] = useState({ total: 0, drafts: 0, finalized: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        const rows = (data as unknown as OrderRecord[]) || [];
        setRecent(rows);
        setLoading(false);
      });
    supabase
      .from("orders")
      .select("status", { count: "exact" })
      .then(({ data }) => {
        const all = (data as unknown as { status: string }[]) || [];
        setStats({
          total: all.length,
          drafts: all.filter((o) => o.status === "draft").length,
          finalized: all.filter((o) => o.status === "finalized").length,
        });
      });
  }, []);

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 lg:px-8 py-8 space-y-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your order acceptances at a glance.</p>
        </div>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={<ListChecks className="h-5 w-5" />} label="Total orders" value={stats.total} accent />
          <StatCard icon={<Clock className="h-5 w-5" />} label="Drafts" value={stats.drafts} />
          <StatCard icon={<FileText className="h-5 w-5" />} label="Finalized" value={stats.finalized} />
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-4">Quick actions</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard icon={<Upload className="h-5 w-5" />} title="Upload cost sheet" desc="AI auto-fills the order from PDF." to="/orders/new" accent />
            <FeatureCard icon={<FilePlus2 className="h-5 w-5" />} title="New blank order" desc="Build an OA manually from scratch." to="/orders/new" />
            <FeatureCard icon={<FileText className="h-5 w-5" />} title="All orders" desc="Browse drafts and finalized OAs." to="/orders" />
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
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No orders yet.</p>
                  <Button className="mt-3" asChild><Link to="/orders/new">Create your first OA</Link></Button>
                </div>
              ) : (
                <ul className="divide-y divide-border/70">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge
                            variant={o.format === "MR" ? "default" : "secondary"}
                            className="rounded-full px-2.5 py-0.5 text-[11px]"
                          >
                            {o.format}
                          </Badge>
                          <div className="min-w-0">
                            <div className="font-mono text-sm truncate font-medium">{o.oa_number}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {o.company_name || o.bill_to?.name || "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold tabular-nums">
                            ₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${o.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                            {o.status}
                          </span>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* How it works */}
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-4">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard step="1" icon={<Upload className="h-4 w-4" />} title="Upload" desc="Drop a cost sheet PDF. AI parses items, HSN, rates and charges." />
            <StepCard step="2" icon={<Sparkles className="h-4 w-4" />} title="Auto-detect" desc="GMS items move to GMS template, MR items to MR automatically." />
            <StepCard step="3" icon={<Eye className="h-4 w-4" />} title="Review" desc="Edit fields, add items, tweak P&F / freight / GST in live preview." />
            <StepCard step="4" icon={<Download className="h-4 w-4" />} title="Export" desc="Download MR + GMS PDFs separately, ready to print or email." />
          </div>
        </section>

      </main>
    </div>
  );
};

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <Card className="rounded-xl border-border/70 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-xl p-3 ${accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold leading-tight tabular-nums mt-0.5">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureCard({
  icon, title, desc, to, accent,
}: { icon: React.ReactNode; title: string; desc: string; to: string; accent?: boolean }) {
  return (
    <Link to={to} className="group">
      <Card className={`h-full rounded-xl border-border/70 shadow-sm transition-all group-hover:shadow-md group-hover:-translate-y-0.5 ${accent ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : ""}`}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className={`rounded-xl p-2.5 ${accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{icon}</div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground pt-0">{desc}</CardContent>
      </Card>
    </Link>
  );
}

function StepCard({
  step, icon, title, desc,
}: { step: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="h-full rounded-xl border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
            {step}
          </span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </CardContent>
    </Card>
  );
}

export default Index;

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText, FilePlus2, LayoutTemplate, Upload, Sparkles,
  Eye, Download, ArrowRight, ListChecks, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";
import appLogo from "@/assets/app-logo.png";

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
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-20 items-center justify-between px-4">
          <Link to="/" aria-label="GMS | MR Engineers — Home" className="flex items-center">
            <img src={appLogo} alt="GMS | MR Engineers" className="h-14 w-auto object-contain" />
          </Link>
          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild><Link to="/">Home</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/orders">Orders</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/orders/templates">Templates</Link></Button>
            <Button size="sm" asChild className="ml-2"><Link to="/orders/new"><FilePlus2 className="h-4 w-4 mr-1" />New OA</Link></Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-10">
        {/* Hero */}
        <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-accent/30 p-8 md:p-10">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="mb-3">MR Engineers · GMS (Ugur)</Badge>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Turn cost sheets into print-ready Order Acceptances in seconds.
            </h1>
            <p className="mt-3 text-muted-foreground md:text-lg">
              Upload a PDF AI extracts items, charges and addresses. Edit live, then export MR and GMS PDFs from a single order.
            </p>
          </div>
        </section>

        {/* Stats */}
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard icon={<ListChecks className="h-5 w-5 text-primary" />} label="Total orders" value={stats.total} />
            <StatCard icon={<Clock className="h-5 w-5 text-muted-foreground" />} label="Drafts" value={stats.drafts} />
            <StatCard icon={<FileText className="h-5 w-5 text-primary" />} label="Finalized" value={stats.finalized} />
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight mb-3">Quick actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={<Upload className="h-5 w-5" />} title="Upload cost sheet" desc="AI auto-fills the order from PDF." to="/orders/new" accent />
            <FeatureCard icon={<FilePlus2 className="h-5 w-5" />} title="New blank order" desc="Build an OA manually from scratch." to="/orders/new" />
            <FeatureCard icon={<FileText className="h-5 w-5" />} title="All orders" desc="Browse drafts and finalized OAs." to="/orders" />
            <FeatureCard icon={<LayoutTemplate className="h-5 w-5" />} title="Templates" desc="Manage MR / GMS PDF templates." to="/orders/templates" />
          </div>
        </section>

        {/* Recent orders */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold tracking-tight">Recent orders</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders">View all<ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading…</p>
              ) : recent.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No orders yet.</p>
                  <Button className="mt-3" asChild><Link to="/orders/new">Create your first OA</Link></Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {recent.map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge variant={o.format === "MR" ? "default" : "secondary"}>{o.format}</Badge>
                          <div className="min-w-0">
                            <div className="font-mono text-sm truncate">{o.oa_number}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {o.company_name || o.bill_to?.name || "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-medium">
                            ₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}
                          </span>
                          <Badge variant="outline" className="capitalize">{o.status}</Badge>
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
          <h2 className="text-xl font-semibold tracking-tight mb-3">How it works</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StepCard step="1" icon={<Upload className="h-4 w-4" />} title="Upload" desc="Drop a cost sheet PDF. AI parses items, HSN, rates and charges." />
            <StepCard step="2" icon={<Sparkles className="h-4 w-4" />} title="Auto-detect" desc="GMS items move to GMS template, MR items to MR — automatically." />
            <StepCard step="3" icon={<Eye className="h-4 w-4" />} title="Review" desc="Edit fields, add items, tweak P&F / freight / GST in live preview." />
            <StepCard step="4" icon={<Download className="h-4 w-4" />} title="Export" desc="Download MR + GMS PDFs separately, ready to print or email." />
          </div>
        </section>

      </main>
    </div>
  );
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">{icon}</div>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureCard({
  icon, title, desc, to, accent,
}: { icon: React.ReactNode; title: string; desc: string; to: string; accent?: boolean }) {
  return (
    <Link to={to}>
      <Card className={`h-full transition-all hover:shadow-md hover:-translate-y-0.5 ${accent ? "border-primary/40 bg-primary/5" : ""}`}>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          <div className={`rounded-md p-1.5 ${accent ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{icon}</div>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{desc}</CardContent>
      </Card>
    </Link>
  );
}

function StepCard({
  step, icon, title, desc,
}: { step: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {step}
          </span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className="font-medium">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </CardContent>
    </Card>
  );
}

export default Index;

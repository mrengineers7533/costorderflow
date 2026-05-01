import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, Receipt, ClipboardList, Plus } from "lucide-react";

function StatCard({ icon: Icon, label, value }: any) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value ?? "—"}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>({});
  const [recentOas, setRecentOas] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [profiles, oas, pis, boqs, recent] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("proforma_invoices").select("id", { count: "exact", head: true }),
        supabase.from("boqs").select("id", { count: "exact", head: true }),
        supabase
          .from("orders")
          .select("id, oa_number, company_name, order_date")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      setStats({
        users: profiles.count,
        oas: oas.count,
        pis: pis.count,
        boqs: boqs.count,
      });
      setRecentOas(recent.data ?? []);
    })();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of system activity.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/orders/new"><Plus className="h-4 w-4 mr-1" /> New OA</Link></Button>
          <Button asChild><Link to="/admin/users">Manage Users</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Total Users" value={stats.users} />
        <StatCard icon={FileText} label="Total OAs" value={stats.oas} />
        <StatCard icon={Receipt} label="Total PIs" value={stats.pis} />
        <StatCard icon={ClipboardList} label="Total BOQs" value={stats.boqs} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Order Acceptances</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOas.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No OAs yet.</div>
          ) : (
            <div className="divide-y">
              {recentOas.map((o) => (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between py-3 text-sm hover:bg-muted/40 px-2 rounded"
                >
                  <div>
                    <div className="font-medium">{o.oa_number}</div>
                    <div className="text-xs text-muted-foreground">{o.company_name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{o.order_date}</div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
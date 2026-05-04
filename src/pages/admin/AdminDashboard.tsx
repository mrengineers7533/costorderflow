import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Users as UsersIcon, UserCheck, Globe, ShieldCheck } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, domains: 0, admins: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [a, b, c, d] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("allowed_domains").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin"),
      ]);
      setStats({
        total: a.count ?? 0,
        active: b.count ?? 0,
        domains: c.count ?? 0,
        admins: d.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "Total Users", value: stats.total, icon: UsersIcon },
    { label: "Active Users", value: stats.active, icon: UserCheck },
    { label: "Allowed Domains", value: stats.domains, icon: Globe },
    { label: "Admins", value: stats.admins, icon: ShieldCheck },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <AdminTabs title="Admin Dashboard" description="Overview of users, domains, and access" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{loading ? "—" : value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
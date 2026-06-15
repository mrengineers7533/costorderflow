import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Users as UsersIcon, UserCheck, Globe, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, domains: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

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

  const runReset = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-cof-data");
      if (error) throw error;
      const c = (data as { counts?: Record<string, number> })?.counts || {};
      toast({
        title: "Generated data reset successfully. Master data and settings were not changed.",
        description: `Removed: ${c.orders ?? 0} OAs · ${c.boqs ?? 0} BOQs · ${c.proforma_invoices ?? 0} PIs · ${c.requisitions ?? 0} PRs · ${c.purchase_orders ?? 0} POs · ${c.cost_sheets ?? 0} SOT sheets · ${c.filesRemoved ?? 0} files.`,
      });
      setResetOpen(false);
      setConfirmText("");
    } catch (e) {
      toast({ title: "Reset failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

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

      <Card className="mt-8 border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone — Reset Generated Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete all generated transactional data: uploaded SOT sheets, OAs, BOQs, PIs,
            PI revisions, linked documents, Purchase Requisitions, Purchase Orders, PR/PO revisions,
            their attachments, audit logs, status history, and all in-app notifications. Calculation
            templates, formulas, app settings, master data (vendors, items, customers, tax),
            notification recipients, users, roles, permissions, and numbering configuration will not
            be touched.
          </p>
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            Reset Generated Data
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all generated transactional data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all generated transactional data: SOT sheets, OAs, BOQs, PIs, Purchase
              Requisitions, Purchase Orders, their revisions, attachments, audit logs, status history,
              and all in-app notifications. Master data, settings, formulas, templates, notification
              recipients, users, roles and numbering configuration will not be changed. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Type <span className="font-mono font-semibold">RESET GENERATED DATA</span> to confirm:</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET GENERATED DATA"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "RESET GENERATED DATA" || resetting}
              onClick={(e) => { e.preventDefault(); runReset(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
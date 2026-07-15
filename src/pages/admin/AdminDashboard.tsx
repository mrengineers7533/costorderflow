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

const PREVIEW_LABELS: { key: string; label: string }[] = [
  { key: "cost_sheets", label: "Cost Sheets" },
  { key: "orders", label: "OA records" },
  { key: "boqs", label: "BOQ records" },
  { key: "boq_revisions", label: "BOQ revisions" },
  { key: "proforma_invoices", label: "PI records" },
  { key: "requisitions", label: "Requisitions" },
  { key: "requisition_annexures", label: "Annexures" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "grn_receipts", label: "GRN receipts" },
  { key: "app_notifications", label: "Notifications" },
  { key: "boq_item_attachments", label: "Item attachments" },
  { key: "boq_design_reviews", label: "Design reviews" },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState({ total: 0, active: 0, domains: 0, admins: 0 });
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCounts, setPreviewCounts] = useState<Record<string, number> | null>(null);

  const loadStats = async () => {
    setLoading(true);
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
  };

  useEffect(() => { loadStats(); }, []);

  const cards = [
    { label: "Total Users", value: stats.total, icon: UsersIcon },
    { label: "Active Users", value: stats.active, icon: UserCheck },
    { label: "Allowed Domains", value: stats.domains, icon: Globe },
    { label: "Admins", value: stats.admins, icon: ShieldCheck },
  ];

  const openReset = async () => {
    setResetOpen(true);
    setPreviewCounts(null);
    setConfirmText("");
    setPreviewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-cof-data", {
        body: { mode: "preview" },
      });
      if (error) throw error;
      setPreviewCounts((data as { counts?: Record<string, number> })?.counts ?? {});
    } catch (e) {
      toast({ title: "Preview failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

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
      await loadStats();
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
          <Button variant="destructive" onClick={openReset}>
            Reset Generated Data
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all generated transactional data?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete all generated Cost Sheets and their linked OA, BOQ,
              PI, Requisition, Annexure, PO, Invoice, GRN and downstream transactional records. Users,
              access control, master data, settings, formulas, notification configuration and email
              configuration will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Records that will be deleted
            </div>
            {previewLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
              </div>
            ) : previewCounts ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {PREVIEW_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium">{previewCounts[key] ?? 0}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Preview unavailable.</div>
            )}
          </div>

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
              {resetting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : "Permanently Reset Generated Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
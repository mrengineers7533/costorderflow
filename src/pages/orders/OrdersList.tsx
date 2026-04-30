import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Upload, FilePlus2, Sparkles, ArrowRight } from "lucide-react";
import type { OrderRecord } from "@/lib/orders/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";

export default function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  function handleExtracted(data: ExtractedCostSheet) {
    setUploadOpen(false);
    navigate("/orders/new/edit", { state: { extracted: data } });
  }

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (!showSuperseded) q = q.eq("is_current", true);
    q.then(({ data, error }) => {
      if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
      else setOrders((data as unknown as OrderRecord[]) || []);
      setLoading(false);
    });
  }, [showSuperseded]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Order Acceptances</h1>
          <p className="text-sm text-muted-foreground mt-1">Browse and manage all your OAs.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <NewOaCard
            onClick={() => setUploadOpen(true)}
            icon={<Upload className="h-5 w-5" />}
            title="Upload Cost Sheet"
            description="Drop a cost sheet PDF — we'll extract company, items and charges to pre-fill the OA."
            cta="Upload PDF"
            badge={
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                <Sparkles className="h-3 w-3" />AI Powered
              </span>
            }
          />
          <NewOaCard
            to="/orders/new/edit"
            icon={<FilePlus2 className="h-5 w-5" />}
            title="Create Blank Manually"
            description="Start with an empty form and enter all order details by hand."
            cta="Start blank"
          />
        </div>

        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload Cost Sheet</DialogTitle>
              <DialogDescription>
                We'll parse the PDF and open the editor with everything pre-filled.
              </DialogDescription>
            </DialogHeader>
            <CostSheetPicker onApply={handleExtracted} />
          </DialogContent>
        </Dialog>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">All Orders</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="show-superseded" className="cursor-pointer">Show superseded revisions</Label>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              orders.length === 0 ? <p className="text-muted-foreground">No orders yet. Click “New Order” to create one.</p> :
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">OA Number</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Rev</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Company</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Net Payable</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/orders/${o.id}`)}>
                      <TableCell className="font-mono font-medium">{o.oa_number}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <span className="px-1.5 py-0.5 rounded bg-muted">R{o.revision ?? 0}</span>
                          {o.is_current
                            ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                            : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={o.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{o.format}</Badge>
                      </TableCell>
                      <TableCell>{o.company_name || o.bill_to?.name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                          <span className={`h-1.5 w-1.5 rounded-full ${o.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                          {o.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NewOaCard({
  to, onClick, icon, title, description, cta, badge,
}: {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  badge?: React.ReactNode;
}) {
  const inner = (
    <Card className="h-full rounded-xl border-border/70 shadow-sm transition-all hover:border-primary/40 hover:shadow-md cursor-pointer">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {badge}
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
          {cta}<ArrowRight className="h-3.5 w-3.5" />
        </span>
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to} className="block h-full group">{inner}</Link>;
  return <button type="button" onClick={onClick} className="block h-full text-left w-full group">{inner}</button>;
}

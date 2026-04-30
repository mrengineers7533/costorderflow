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
import { Plus } from "lucide-react";
import type { OrderRecord } from "@/lib/orders/types";

export default function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);

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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Order Acceptances</h1>
            <p className="text-sm text-muted-foreground mt-1">Browse and manage all your OAs.</p>
          </div>
          <Button asChild className="rounded-lg">
            <Link to="/orders/new"><Plus className="mr-1 h-4 w-4" />New Order</Link>
          </Button>
        </div>
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

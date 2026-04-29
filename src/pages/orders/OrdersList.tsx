import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import type { OrderRecord } from "@/lib/orders/types";

export default function OrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("orders").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast({ title: "Failed to load", description: error.message, variant: "destructive" });
        else setOrders((data as unknown as OrderRecord[]) || []);
        setLoading(false);
      });
  }, []);

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
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">All Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              orders.length === 0 ? <p className="text-muted-foreground">No orders yet. Click “New Order” to create one.</p> :
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">OA Number</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Company</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">Net Payable</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o, idx) => {
                    const tones = ["sky", "emerald", "violet", "amber", "rose"] as const;
                    const tone = tones[idx % tones.length];
                    return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate(`/orders/${o.id}`)}>
                      <TableCell className="font-mono font-medium">
                        <span className={`inline-block h-2 w-2 rounded-full mr-2 align-middle bg-brand-${tone}`} />
                        {o.oa_number}
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-full px-2.5 py-0.5 text-[11px] border-0 text-white ${o.format === "MR" ? "bg-brand-sky" : "bg-brand-violet"}`}>{o.format}</Badge>
                      </TableCell>
                      <TableCell>{o.company_name || o.bill_to?.name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] capitalize border ${o.status === "finalized" ? "bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30" : "bg-brand-amber/15 text-brand-amber border-brand-amber/30"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${o.status === "finalized" ? "bg-brand-emerald" : "bg-brand-amber"}`} />
                          {o.status}
                        </span>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

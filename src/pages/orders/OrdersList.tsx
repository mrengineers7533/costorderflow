import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Home } from "lucide-react";
import type { OrderRecord } from "@/lib/orders/types";
import appLogo from "@/assets/app-logo.png";

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
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Home" className="flex items-center">
              <img src={appLogo} alt="GMS | MR Engineers" className="h-10 w-auto object-contain" />
            </Link>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><Home className="mr-1 h-4 w-4" />Home</Link>
            </Button>
            <h1 className="text-2xl font-bold">Order Acceptances</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild><Link to="/orders/new">+ New Order</Link></Button>
            <Button variant="outline" asChild><Link to="/orders/templates">Templates</Link></Button>
          </div>
        </div>
        <Card>
          <CardHeader><CardTitle>All Orders</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              orders.length === 0 ? <p className="text-muted-foreground">No orders yet. Click “New Order” to create one.</p> :
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OA Number</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Net Payable</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                      <TableCell className="font-mono">{o.oa_number}</TableCell>
                      <TableCell><Badge variant={o.format === "MR" ? "default" : "secondary"}>{o.format}</Badge></TableCell>
                      <TableCell>{o.company_name || o.bill_to?.name || "-"}</TableCell>
                      <TableCell>{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="text-right font-medium">₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
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

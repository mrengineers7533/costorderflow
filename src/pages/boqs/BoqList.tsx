import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { BoqRecord } from "@/lib/boq/types";

export default function BoqList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("boqs").select("*").order("created_at", { ascending: false }).then(({ data, error }) => {
      if (error) toast({ title: "Failed to load BOQs", description: error.message, variant: "destructive" });
      else setRows((data as unknown as BoqRecord[]) || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">BOQ Folder</h1>
            <p className="text-sm text-muted-foreground mt-1">Bill-of-quantities documents generated from your orders.</p>
          </div>
          <Button asChild variant="outline" className="rounded-lg">
            <Link to="/orders">Go to Orders</Link>
          </Button>
        </div>
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">All BOQs</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              rows.length === 0 ? (
                <p className="text-muted-foreground">No BOQs yet. Open an Order and click <span className="font-medium">Generate BOQ</span>.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">BOQ No.</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Version</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Reference OA</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Client</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.id} className="cursor-pointer hover:bg-accent/40" onClick={() => nav(`/boqs/${b.id}`)}>
                        <TableCell className="font-mono font-medium">{b.boq_number}</TableCell>
                        <TableCell>v{b.version}</TableCell>
                        <TableCell><Badge variant={b.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{b.format}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{b.reference_oa_number || "-"}</TableCell>
                        <TableCell>{b.client_name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(b.boq_date).toLocaleDateString("en-IN")}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                            <span className={`h-1.5 w-1.5 rounded-full ${b.status === "finalized" ? "bg-primary" : "bg-muted-foreground/60"}`} />
                            {b.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
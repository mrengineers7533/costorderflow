import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ChevronDown, FilePlus2, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqRecord } from "@/lib/boq/types";

type OaOption = {
  id: string;
  oa_number: string;
  format: "MR" | "GMS";
  order_date: string;
  has_boq: boolean;
};

export default function BoqList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [oas, setOas] = useState<OaOption[]>([]);
  const [oaSearch, setOaSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("boqs").select("*").order("created_at", { ascending: false });
    if (!showSuperseded) q = q.eq("is_current", true);
    q.then(({ data, error }) => {
      if (error) toast({ title: "Failed to load BOQs", description: error.message, variant: "destructive" });
      else setRows((data as unknown as BoqRecord[]) || []);
      setLoading(false);
    });
  }, [showSuperseded]);

  // Load current OAs + which already have a current BOQ, for the dropdown.
  useEffect(() => {
    (async () => {
      const { data: ords } = await supabase
        .from("orders")
        .select("id, oa_number, format, order_date, is_current")
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      const { data: existing } = await supabase
        .from("boqs")
        .select("order_id, is_current")
        .eq("is_current", true);
      const withBoq = new Set((existing || []).map((b: any) => b.order_id));
      setOas(
        ((ords as any[]) || []).map((o) => ({
          id: o.id,
          oa_number: o.oa_number,
          format: o.format,
          order_date: o.order_date,
          has_boq: withBoq.has(o.id),
        }))
      );
    })();
  }, [rows]);

  const filteredOas = oas.filter((o) =>
    o.oa_number.toLowerCase().includes(oaSearch.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">BOQ Folder</h1>
            <p className="text-sm text-muted-foreground mt-1">Bill-of-quantities documents generated from your orders.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg">
              <Link to="/orders">Go to Orders</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-lg">
                  <FilePlus2 className="mr-1.5 h-4 w-4" />
                  Create BOQ
                  <ChevronDown className="ml-1.5 h-4 w-4 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[340px]">
                <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                  Pick an OA to generate from
                </DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={oaSearch}
                      onChange={(e) => setOaSearch(e.target.value)}
                      placeholder="Search OA number…"
                      className="h-8 pl-7 text-sm"
                    />
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-72 overflow-y-auto">
                  {filteredOas.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {oas.length === 0 ? "No OAs available yet." : "No OAs match your search."}
                    </div>
                  ) : (
                    filteredOas.map((o) => (
                      <DropdownMenuItem
                        key={o.id}
                        onSelect={() => nav(`/boqs/new?orderId=${o.id}`)}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-medium truncate">{o.oa_number}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(o.order_date).toLocaleDateString("en-IN")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={o.format === "MR" ? "default" : "secondary"} className="text-[9px] px-1.5 py-0">
                            {o.format}
                          </Badge>
                          {o.has_boq && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">Has BOQ</Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">All BOQs</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <Switch id="boq-show-superseded" checked={showSuperseded} onCheckedChange={setShowSuperseded} />
              <Label htmlFor="boq-show-superseded" className="cursor-pointer">Show superseded revisions</Label>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-muted-foreground">Loading…</p> :
              rows.length === 0 ? (
                <p className="text-muted-foreground">No BOQs yet. Open an Order and click <span className="font-medium">Generate BOQ</span>.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">BOQ No.</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Rev</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Format</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Reference OA</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Date</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((b) => (
                      <TableRow key={b.id} className="cursor-pointer hover:bg-accent/40" onClick={() => nav(`/boqs/${b.id}`)}>
                        <TableCell className="font-mono font-medium">{b.boq_number}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                            <span className="px-1.5 py-0.5 rounded bg-muted">R{b.revision ?? 0}</span>
                            {b.is_current
                              ? <Badge variant="default" className="text-[9px] uppercase">Current</Badge>
                              : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant={b.format === "MR" ? "default" : "secondary"} className="rounded-full px-2.5 py-0.5 text-[11px]">{b.format}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{b.reference_oa_number || "-"}</TableCell>
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
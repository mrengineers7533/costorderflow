import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search } from "lucide-react";
import type { BoqRecord } from "@/lib/boq/types";

export default function DesignBoqList() {
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"MR" | "GMS">("MR");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("boqs")
        .select("id, boq_number, client_name, project_number, reference_oa_number, format, status, design_review_status, updated_at, prepared_by, revision, is_current")
        .order("updated_at", { ascending: false });
      setRows((data || []) as unknown as BoqRecord[]);
      setLoading(false);
    })();
  }, []);

  const counts = useMemo(() => {
    let mr = 0, gms = 0;
    for (const r of rows) (r.format === "MR" ? mr++ : gms++);
    return { MR: mr, GMS: gms };
  }, [rows]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => r.format === tab)
      .filter((r) =>
        !term
          ? true
          : [r.boq_number, r.client_name, r.reference_oa_number, r.project_number]
              .some((v) => (v || "").toLowerCase().includes(term)),
      );
  }, [rows, tab, q]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Design</h1>
          <p className="text-sm text-muted-foreground">
            Read-only BOQ view for the Design team. Add item-wise comments below.
          </p>
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search BOQ / OA / client"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 w-72"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "MR" | "GMS")}>
        <TabsList>
          <TabsTrigger value="MR">MR BOQs ({counts.MR})</TabsTrigger>
          <TabsTrigger value="GMS">GMS BOQs ({counts.GMS})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tab} BOQs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No BOQs to show.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BOQ #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>OA Ref</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.boq_number}</TableCell>
                    <TableCell>{r.client_name || "—"}</TableCell>
                    <TableCell>{r.reference_oa_number || "—"}</TableCell>
                    <TableCell>{r.project_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "finalized" ? "default" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/design/${r.id}`}>
                          <Eye className="h-4 w-4 mr-1" /> Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
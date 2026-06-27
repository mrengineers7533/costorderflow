import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Loader2 } from "lucide-react";
import {
  loadRevisionRepairReport,
  type RepairRow,
  type RepairStatus,
} from "@/lib/boq/revisionRepairReport";

const STATUS_META: Record<RepairStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  native_approved:        { label: "Native Approved",        variant: "default" },
  repaired_inherited:     { label: "Repaired (Inherited)",   variant: "secondary" },
  needs_repair:           { label: "Needs Repair",           variant: "destructive" },
  not_approved_by_design: { label: "Not Approved by Design", variant: "outline" },
  no_boq:                 { label: "No linked BOQ",          variant: "outline" },
};

export default function RevisionRepairReport() {
  const [rows, setRows] = useState<RepairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState<"ALL" | "GMS" | "MR">("ALL");
  const [status, setStatus] = useState<"ALL" | RepairStatus>("ALL");
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await loadRevisionRepairReport();
      setRows(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (family !== "ALL" && r.family !== family) return false;
      if (status !== "ALL" && r.status !== status) return false;
      if (q && !r.oaNumber.toLowerCase().includes(q) && !(r.boqNumber || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, family, status, search]);

  const totals = useMemo(() => {
    const t: Record<RepairStatus, number> = {
      native_approved: 0, repaired_inherited: 0, needs_repair: 0,
      not_approved_by_design: 0, no_boq: 0,
    };
    for (const r of rows) t[r.status]++;
    return t;
  }, [rows]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <AdminTabs
        title="Revision Repair Report"
        description="Read-only diagnostic: detects OA/BOQ revisions with missing/pending approval snapshots and verifies inherited repairs."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        {(Object.keys(STATUS_META) as RepairStatus[]).map((k) => (
          <Card key={k}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {STATUS_META[k].label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{loading ? "—" : totals[k]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">OA / BOQ revisions</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Search OA / BOQ number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Select value={family} onValueChange={(v) => setFamily(v as typeof family)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All families</SelectItem>
                <SelectItem value="GMS">GMS</SelectItem>
                <SelectItem value="MR">MR</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {(Object.keys(STATUS_META) as RepairStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{STATUS_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OA Number</TableHead>
                <TableHead>Rev</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Linked BOQ</TableHead>
                <TableHead>BOQ Rev</TableHead>
                <TableHead>Items (Approved/Total)</TableHead>
                <TableHead>Direct</TableHead>
                <TableHead>Inherited</TableHead>
                <TableHead>Ancestor Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No revisions match.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <TableRow key={r.orderId}>
                    <TableCell className="font-mono text-xs">{r.oaNumber}</TableCell>
                    <TableCell>R{r.oaRevision}</TableCell>
                    <TableCell>{r.family}</TableCell>
                    <TableCell className="font-mono text-xs">{r.boqNumber || "—"}</TableCell>
                    <TableCell>{r.boqRevision != null ? `R${r.boqRevision}` : "—"}</TableCell>
                    <TableCell>{r.approvedItems}/{r.totalItems}</TableCell>
                    <TableCell>{r.directRows}</TableCell>
                    <TableCell>{r.inheritedRows}</TableCell>
                    <TableCell>{r.ancestorApproved ? "Yes" : "No"}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                    <TableCell className="text-right space-x-2">
                      <Link to={`/orders/${r.orderId}`} className="text-primary hover:underline text-xs">OA</Link>
                      {r.boqId && (
                        <Link to={`/boqs/${r.boqId}`} className="text-primary hover:underline text-xs">BOQ</Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Read-only. Opening or refreshing this page does not modify any data — it only reads existing snapshot, BOQ, OA, and design-status rows.
      </p>
    </div>
  );
}
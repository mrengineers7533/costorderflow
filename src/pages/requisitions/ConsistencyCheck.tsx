import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Eye, MinusCircle, Search } from "lucide-react";
import { loadConsistencyRows, type ConsistencyRow } from "@/lib/requisition/consistency";

type StatusFilter = "all" | "matched" | "mismatch" | "na";

function StatusBadge({ kind, delta }: { kind: "match" | "mismatch" | "na"; delta?: number }) {
  if (kind === "na") return <Badge variant="outline" className="gap-1"><MinusCircle className="h-3 w-3" />N/A</Badge>;
  if (kind === "match") return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" />Matched</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Mismatch{typeof delta === "number" && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}</Badge>;
}

export default function ConsistencyCheck() {
  const [rows, setRows] = useState<ConsistencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(await loadConsistencyRows()); } finally { setLoading(false); }
    })();
  }, []);

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.overall === "match").length;
    const mismatched = rows.filter((r) => r.overall === "mismatch").length;
    const naOk = rows.filter((r) => r.overall === "na-ok").length;
    return { total: rows.length, matched, mismatched, naOk };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "matched" && r.overall !== "match") return false;
      if (status === "mismatch" && r.overall !== "mismatch") return false;
      if (status === "na" && r.overall !== "na-ok") return false;
      if (!needle) return true;
      return `${r.requisitionNumber} ${r.boqRef}`.toLowerCase().includes(needle);
    });
  }, [rows, q, status]);

  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Data Consistency Check</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Verify that BOQ → Requisition → Raw Materials → Annexure counts line up.
          </p>
        </div>
        <Link to="/requisitions"><Button variant="outline" size="sm">Back to Requisitions</Button></Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Total Checked</div><div className="text-2xl font-semibold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Matched</div><div className="text-2xl font-semibold text-emerald-600">{summary.matched}</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">Mismatched</div><div className="text-2xl font-semibold text-destructive">{summary.mismatched}</div></CardContent></Card>
        <Card><CardContent className="py-3"><div className="text-xs text-muted-foreground">General (BOQ N/A, RM matched)</div><div className="text-2xl font-semibold">{summary.naOk}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <div className="md:col-span-2 relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="h-8 pl-7" placeholder="Search requisition / OA / BOQ" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="matched">Matched only</SelectItem>
              <SelectItem value="mismatch">Mismatch only</SelectItem>
              <SelectItem value="na">N/A (General)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center text-muted-foreground">{filtered.length} of {rows.length}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Consistency Summary</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No requisitions match.</div>
          ) : (
            <table className="w-full text-sm border">
              <thead className="text-xs text-muted-foreground border-b bg-muted/40">
                <tr>
                  <th className="text-left py-2 px-2 border-r">Requisition</th>
                  <th className="text-left py-2 px-2 border-r">OA / BOQ</th>
                  <th className="text-right py-2 px-2 border-r">BOQ Items</th>
                  <th className="text-right py-2 px-2 border-r">FG Items</th>
                  <th className="text-left py-2 px-2 border-r">BOQ ↔ FG</th>
                  <th className="text-right py-2 px-2 border-r">RM Total</th>
                  <th className="text-right py-2 px-2 border-r">Annex Created</th>
                  <th className="text-right py-2 px-2 border-r">Annex Pending</th>
                  <th className="text-left py-2 px-2 border-r">RM ↔ Annex</th>
                  <th className="text-left py-2 px-2 border-r">Overall</th>
                  <th className="text-left py-2 px-2">View</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const bad = r.overall === "mismatch";
                  return (
                    <tr key={r.requisitionId} className={`border-b last:border-0 ${bad ? "bg-destructive/5" : ""}`}>
                      <td className="py-2 px-2 border-r font-medium">{r.requisitionNumber}</td>
                      <td className="py-2 px-2 border-r">{r.boqRef}</td>
                      <td className="py-2 px-2 border-r text-right">{r.boqCount ?? "—"}</td>
                      <td className="py-2 px-2 border-r text-right">{r.fgCount}</td>
                      <td className="py-2 px-2 border-r"><StatusBadge kind={r.boqVsFg} delta={r.boqVsFgDelta} /></td>
                      <td className="py-2 px-2 border-r text-right">{r.rmTotal}</td>
                      <td className="py-2 px-2 border-r text-right">{r.annexCreated}</td>
                      <td className="py-2 px-2 border-r text-right">{r.annexPending}</td>
                      <td className="py-2 px-2 border-r"><StatusBadge kind={r.rmVsAnnex} delta={r.rmVsAnnexDelta} /></td>
                      <td className="py-2 px-2 border-r">
                        {r.overall === "mismatch"
                          ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Mismatch</Badge>
                          : r.overall === "na-ok"
                            ? <Badge variant="outline">N/A</Badge>
                            : <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Matched</Badge>}
                      </td>
                      <td className="py-2 px-2">
                        <Link to={`/requisitions/${r.requisitionId}`}>
                          <Button size="sm" variant="ghost" title="Open requisition"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
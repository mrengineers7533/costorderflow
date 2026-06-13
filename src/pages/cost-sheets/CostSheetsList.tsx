import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, Download, ExternalLink, Eye, FileSpreadsheet,
  Loader2, RefreshCw, Search, Trash2, XCircle,
} from "lucide-react";

type Status = "pending" | "parsing" | "parsed" | "failed";

interface Row {
  id: string;
  file_path: string;
  original_filename: string;
  status: Status;
  parse_error: string | null;
  extracted: {
    company_name?: string;
    cost_sheet_number?: string;
    _progress?: { percent: number; message: string };
  } | null;
  user_id: string | null;
  created_at: string;
}

interface LinkedOA {
  id: string;
  oa_number: string;
  format: "MR" | "GMS";
  cost_sheet_number: string | null;
}

export default function CostSheetsList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [oaIdx, setOaIdx] = useState<Record<string, LinkedOA[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  async function refresh() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cost_sheets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load cost sheets", description: error.message, variant: "destructive" });
    } else {
      setRows((data as unknown as Row[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("cost_sheets_list_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cost_sheets" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((r) => r.id !== (payload.old as { id: string }).id);
            }
            const row = payload.new as unknown as Row;
            const exists = prev.some((r) => r.id === row.id);
            return exists ? prev.map((r) => (r.id === row.id ? row : r)) : [row, ...prev];
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Index linked OAs by cost_sheet_number
  useEffect(() => {
    const nums = Array.from(new Set(
      rows.map((r) => r.extracted?.cost_sheet_number).filter((n): n is string => !!n && n.trim().length > 0),
    ));
    if (nums.length === 0) { setOaIdx({}); return; }
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, oa_number, format, cost_sheet_number")
        .in("cost_sheet_number", nums);
      const idx: Record<string, LinkedOA[]> = {};
      for (const o of (data || []) as LinkedOA[]) {
        if (!o.cost_sheet_number) continue;
        (idx[o.cost_sheet_number] ||= []).push(o);
      }
      setOaIdx(idx);
    })();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        r.original_filename,
        r.extracted?.cost_sheet_number || "",
        r.extracted?.company_name || "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter]);

  async function openSheet(r: Row) {
    const { data, error } = await supabase.storage
      .from("cost-sheets").createSignedUrl(r.file_path, 600);
    if (error || !data?.signedUrl) {
      return toast({ title: "Could not open PDF", description: error?.message, variant: "destructive" });
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function downloadSheet(r: Row) {
    const { data, error } = await supabase.storage
      .from("cost-sheets").createSignedUrl(r.file_path, 600, { download: r.original_filename });
    if (error || !data?.signedUrl) {
      return toast({ title: "Download failed", description: error?.message, variant: "destructive" });
    }
    window.location.href = data.signedUrl;
  }

  async function reparse(r: Row) {
    setRows((prev) => prev.map((p) => p.id === r.id ? { ...p, status: "parsing", parse_error: null } : p));
    const { error } = await supabase.functions.invoke("parse-cost-sheet", { body: { cost_sheet_id: r.id } });
    if (error) {
      toast({ title: "Re-parse failed", description: (error as { message?: string }).message || "", variant: "destructive" });
      refresh();
    } else {
      toast({ title: "Re-parsed", description: r.original_filename });
    }
  }

  async function deleteSheet(r: Row) {
    if (!confirm(`Delete ${r.original_filename}?`)) return;
    await supabase.storage.from("cost-sheets").remove([r.file_path]);
    const { error } = await supabase.from("cost_sheets").delete().eq("id", r.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
  }

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cost Sheets</h1>
            <p className="text-sm text-muted-foreground">
              Every uploaded cost sheet is saved here. View, download, re-parse, or delete.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">History ({filtered.length})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 h-9 w-64"
                  placeholder="Search filename, cost sheet no, client…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="parsed">Parsed</SelectItem>
                  <SelectItem value="parsing">Parsing</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground italic">
                No cost sheets match your filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Cost Sheet No.</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked OAs</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const oas = r.extracted?.cost_sheet_number
                      ? oaIdx[r.extracted.cost_sheet_number] || []
                      : [];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium max-w-[280px] truncate" title={r.original_filename}>
                          {r.original_filename}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.extracted?.cost_sheet_number || "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.extracted?.company_name || "—"}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          {oas.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {oas.map((o) => (
                                <Button key={o.id} asChild size="sm" variant="secondary" className="h-6 px-2 text-xs">
                                  <Link to={`/orders/${o.id}`} title={o.oa_number}>
                                    <ExternalLink className="h-3 w-3 mr-1" />{o.format}
                                  </Link>
                                </Button>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openSheet(r)} title="View PDF">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => downloadSheet(r)} title="Download">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => reparse(r)} disabled={r.status === "parsing"} title="Re-parse">
                              {r.status === "parsing"
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <RefreshCw className="h-4 w-4" />}
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteSheet(r)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "parsed") return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Parsed</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  if (status === "parsing") return <Badge variant="default" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Parsing</Badge>;
  return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}
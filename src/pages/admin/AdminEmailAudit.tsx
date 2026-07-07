import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download } from "lucide-react";

interface Row {
  id: string;
  notification_id: string;
  source_module: string | null;
  source_doc_no: string | null;
  notification_type: string | null;
  created_by_user: string | null;
  created_by_department: string | null;
  target_department: string | null;
  recipient_email: string;
  cc_emails: string[] | null;
  email_from: string | null;
  subject: string | null;
  status: string;
  sent_at: string | null;
  gmail_message_id: string | null;
  error: string | null;
  kind: string;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  reminder_count: number;
  seen_status: boolean;
  ack_status: boolean;
  created_at: string;
}

const PAGE_SIZE = 50;

function StatusBadge({ s }: { s: string }) {
  if (s === "sent") return <Badge>Sent</Badge>;
  if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function toCsv(rows: Row[]): string {
  const headers = [
    "Email Log ID", "Notification ID", "Module", "Doc No", "Type",
    "Created By", "Created By Dept", "Target Dept", "To", "CC", "From",
    "Subject", "Status", "Sent At", "Gmail Msg ID", "Error",
    "Kind", "Reminder Sent", "Reminder At", "Reminder Count",
    "Seen", "Ack", "Created At",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.notification_id, r.source_module, r.source_doc_no, r.notification_type,
      r.created_by_user, r.created_by_department, r.target_department,
      r.recipient_email, (r.cc_emails || []).join(";"), r.email_from,
      r.subject, r.status, r.sent_at, r.gmail_message_id, r.error,
      r.kind, r.reminder_sent ? "Yes" : "No", r.reminder_sent_at, r.reminder_count,
      r.seen_status ? "Yes" : "No", r.ack_status ? "Yes" : "No", r.created_at,
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

export default function AdminEmailAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string>("all");
  const [reminder, setReminder] = useState<string>("all");
  const [seen, setSeen] = useState<string>("all");
  const [module, setModule] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("email_notification_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (status !== "all") q = q.eq("status", status);
      if (reminder === "yes") q = q.eq("reminder_sent", true);
      if (reminder === "no") q = q.eq("reminder_sent", false);
      if (seen === "seen") q = q.eq("seen_status", true);
      if (seen === "unseen") q = q.eq("seen_status", false);
      if (seen === "ack") q = q.eq("ack_status", true);
      if (module !== "all") q = q.eq("source_module", module);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`recipient_email.ilike.${s},source_doc_no.ilike.${s},subject.ilike.${s}`);
      }
      const { data, count } = await q;
      if (cancelled) return;
      setRows((data as Row[]) || []);
      setTotal(count || 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [page, status, reminder, seen, module, search]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("email_notification_log")
      .select("source_module")
      .not("source_module", "is", null)
      .limit(500)
      .then(({ data }: { data: Array<{ source_module: string | null }> | null }) => {
        const set = new Set<string>();
        (data || []).forEach((d) => d.source_module && set.add(d.source_module));
        setModules(Array.from(set).sort());
      });
  }, []);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const downloadCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `email-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <AdminTabs title="Email Audit" description="Per-recipient delivery log for every notification email." />

      <div className="flex flex-wrap gap-2 items-end mb-4">
        <div className="min-w-[220px] flex-1">
          <label className="text-xs text-muted-foreground">Search (recipient / doc / subject)</label>
          <Input value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} placeholder="Search…" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block">Module</label>
          <Select value={module} onValueChange={(v) => { setPage(0); setModule(v); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block">Status</label>
          <Select value={status} onValueChange={(v) => { setPage(0); setStatus(v); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block">Reminder</label>
          <Select value={reminder} onValueChange={(v) => { setPage(0); setReminder(v); }}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="yes">Sent</SelectItem>
              <SelectItem value="no">Not sent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block">Seen / Ack</label>
          <Select value={seen} onValueChange={(v) => { setPage(0); setSeen(v); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="seen">Seen</SelectItem>
              <SelectItem value="unseen">Unseen</SelectItem>
              <SelectItem value="ack">Acknowledged</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      <div className="border rounded overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-2 py-2">Module</th>
              <th className="px-2 py-2">Doc No</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Created By</th>
              <th className="px-2 py-2">Target Dept</th>
              <th className="px-2 py-2">Sent To</th>
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Sent At</th>
              <th className="px-2 py-2">Reminder</th>
              <th className="px-2 py-2">Seen</th>
              <th className="px-2 py-2">Ack</th>
              <th className="px-2 py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">
                <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Loading…
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">No email records.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/20">
                <td className="px-2 py-2 capitalize">{r.source_module || "—"}</td>
                <td className="px-2 py-2 font-medium">{r.source_doc_no || "—"}</td>
                <td className="px-2 py-2">{r.notification_type || "—"}</td>
                <td className="px-2 py-2">
                  <div>{r.created_by_user || "—"}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{r.created_by_department || ""}</div>
                </td>
                <td className="px-2 py-2 capitalize">{r.target_department || "—"}</td>
                <td className="px-2 py-2">
                  <div>{r.recipient_email}</div>
                  {r.cc_emails && r.cc_emails.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">CC: {r.cc_emails.join(", ")}</div>
                  )}
                </td>
                <td className="px-2 py-2 max-w-[280px] truncate" title={r.subject || ""}>{r.subject || "—"}</td>
                <td className="px-2 py-2"><StatusBadge s={r.status} /></td>
                <td className="px-2 py-2 whitespace-nowrap">{r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}</td>
                <td className="px-2 py-2">
                  {r.reminder_sent ? (
                    <div>
                      <Badge variant="secondary">Yes ({r.reminder_count})</Badge>
                      {r.reminder_sent_at && <div className="text-[10px] text-muted-foreground mt-1">{new Date(r.reminder_sent_at).toLocaleString()}</div>}
                    </div>
                  ) : <Badge variant="outline">No</Badge>}
                </td>
                <td className="px-2 py-2">{r.seen_status ? <Badge variant="secondary">Seen</Badge> : <Badge variant="outline">—</Badge>}</td>
                <td className="px-2 py-2">{r.ack_status ? <Badge>Ack</Badge> : <Badge variant="outline">—</Badge>}</td>
                <td className="px-2 py-2 max-w-[240px]">
                  {r.error ? <span className="text-destructive text-[11px]" title={r.error}>{r.error.slice(0, 60)}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm">
        <div className="text-muted-foreground">{total} rows · page {page + 1} of {pageCount}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</Button>
        </div>
      </div>
    </div>
  );
}
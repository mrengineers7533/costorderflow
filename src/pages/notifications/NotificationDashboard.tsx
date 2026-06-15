import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Search, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NotificationDetailDialog } from "@/components/notifications/NotificationDetailDialog";
import { NotificationCharts, deptOf } from "@/components/notifications/NotificationCharts";
import { normalizeDept } from "@/lib/notifications/dept";
import { useUserRole } from "@/hooks/useUserRole";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface NotifRow {
  id: string;
  module: string;
  event_type: string;
  record_id: string | null;
  record_ref: string | null;
  client_name: string | null;
  title: string;
  summary: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_user_name: string | null;
  actor_department: string | null;
  target_departments: string[];
  created_at: string;
  line_item_changes?: unknown[] | null;
}

/** Drop notifications that carry no actionable change. */
function hasRealChange(n: NotifRow): boolean {
  if (n.event_type && n.event_type.endsWith("line_items_changed")) {
    return Array.isArray(n.line_item_changes) && n.line_item_changes.length > 0;
  }
  if (n.event_type === "comment_added" || n.event_type === "comment_updated") {
    const nv = (n.new_value || {}) as Record<string, unknown>;
    const ov = (n.old_value || {}) as Record<string, unknown>;
    const next = String(nv.new_comment ?? "").trim();
    const prev = String(ov.old_comment ?? "").trim();
    return next.length > 0 && next !== prev;
  }
  return true;
}

interface ReadRow {
  notification_id: string;
  user_id: string;
  user_name: string | null;
  department: string | null;
  seen_at: string;
}

// Field keys that are noisy / internal — hide from dashboard & detail.
const HIDDEN_FIELDS = new Set<string>([
  "id",
  "user_id",
  "order_id",
  "boq_id",
  "pi_id",
  "po_id",
  "grn_id",
  "requisition_id",
  "vendor_id",
  "client_id",
  "cost_sheet_id",
  "created_at",
  "updated_at",
  "version",
]);

// Pretty labels for common technical keys.
const FIELD_LABELS: Record<string, string> = {
  boq_no: "BOQ No",
  oa_no: "OA No",
  pi_no: "PI No",
  po_no: "PO No",
  client_name: "Client",
  format: "Format",
  status: "Status",
  notes: "Notes",
  terms: "Terms & Conditions",
  qty: "Qty",
  rate: "Rate",
  amount: "Amount",
  model_number: "Model",
  description: "Description",
  unit: "Unit",
  motor: "Motor",
  boq_date: "BOQ Date",
  oa_date: "OA Date",
  pi_date: "PI Date",
  po_date: "PO Date",
};

function labelOf(k: string) {
  return FIELD_LABELS[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isUuid(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function truncate(v: unknown, n = 80): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Returns the list of changed, user-meaningful field keys. */
function changedFields(n: NotifRow): string[] {
  const o = n.old_value || {};
  const v = n.new_value || {};
  const keys = new Set<string>([...Object.keys(o), ...Object.keys(v)]);
  const out: string[] = [];
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue;
    if (k.endsWith("_id")) continue;
    const a = (o as Record<string, unknown>)[k];
    const b = (v as Record<string, unknown>)[k];
    if (isUuid(a) && isUuid(b)) continue;
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    out.push(k);
  }
  return out;
}

export default function NotificationDashboard() {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "all" | "new" | "pending" | "ack" | "partial" | "full"
  >("all");
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [actorDeptFilter, setActorDeptFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [chartDeptFilter, setChartDeptFilter] = useState<string | null>(null);
  const [chartStatusFilter, setChartStatusFilter] = useState<"seen" | "pending" | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useUserRole(me?.id);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  async function deleteOne(id: string) {
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase
      .from("app_notifications" as never)
      .delete()
      .eq("id", id);
    if (error) {
      setRows(prev);
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notification deleted" });
    }
  }

  async function deleteAll() {
    setDeletingAll(true);
    const { error } = await supabase
      .from("app_notifications" as never)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    setDeletingAll(false);
    setConfirmDeleteAll(false);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setRows([]);
    setReads([]);
    toast({ title: "All notifications deleted" });
  }

  // Deep-link: open detail dialog when ?id=<uuid> is present.
  useEffect(() => {
    const qid = searchParams.get("id");
    if (qid && qid !== openId) setOpenId(qid);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    let myDept = "Other";
    let myName = auth.user?.email || "User";
    if (uid) {
      const { data: rec } = await supabase
        .from("notification_recipients")
        .select("department,name")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      myDept = (rec as { department?: string } | null)?.department || "Other";
      myName = (rec as { name?: string } | null)?.name || myName;
    }
    setMe(uid ? { id: uid, name: myName, department: myDept } : null);

    const { data: n } = await supabase
      .from("app_notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const fetched = ((n || []) as unknown as NotifRow[]).filter(hasRealChange);
    setRows(fetched);

    const ids = ((n || []) as unknown as { id: string }[]).map((r) => r.id);
    if (ids.length) {
      const { data: r } = await supabase
        .from("app_notification_reads" as never)
        .select("*")
        .in("notification_id", ids);
      setReads(((r || []) as unknown as ReadRow[]));
    } else {
      setReads([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const myReadIds = useMemo(() => {
    if (!me) return new Set<string>();
    return new Set(reads.filter((r) => r.user_id === me.id).map((r) => r.notification_id));
  }, [reads, me]);

  const readsByNotif = useMemo(() => {
    const m: Record<string, ReadRow[]> = {};
    for (const r of reads) (m[r.notification_id] ||= []).push(r);
    return m;
  }, [reads]);

  const modules = useMemo(() => {
    const s = new Set(rows.map((r) => r.module));
    return ["all", ...Array.from(s).sort()];
  }, [rows]);

  const allDepts = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.target_departments.forEach((d) => s.add(d)));
    return ["all", ...Array.from(s).sort()];
  }, [rows]);

  const actorDepts = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.actor_department && s.add(r.actor_department));
    return ["all", ...Array.from(s).sort()];
  }, [rows]);

  function deptStatus(n: NotifRow): {
    total: number;
    seen: number;
    pending: number;
    label: "Pending" | "Partially Seen" | "Fully Seen" | "—";
  } {
    const total = n.target_departments.length;
    const targetKeys = new Set(n.target_departments.map(normalizeDept));
    const ackKeys = new Set(
      (readsByNotif[n.id] || [])
        .map((r) => normalizeDept(r.department))
        .filter((k) => k && targetKeys.has(k)),
    );
    const seen = ackKeys.size;
    const pending = Math.max(0, total - seen);
    const label =
      total === 0
        ? "—"
        : seen === 0
          ? "Pending"
          : seen >= total
            ? "Fully Seen"
            : "Partially Seen";
    return { total, seen, pending, label };
  }

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 86_400_000 : null;
    return rows.filter((r) => {
      if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
      if (deptFilter !== "all" && !r.target_departments.includes(deptFilter)) return false;
      if (actorDeptFilter !== "all" && r.actor_department !== actorDeptFilter) return false;
      const ts = new Date(r.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      const ds = deptStatus(r);
      if (tab === "new" && myReadIds.has(r.id)) return false;
      if (tab === "ack" && !myReadIds.has(r.id)) return false;
      if (tab === "pending" && ds.label !== "Pending") return false;
      if (tab === "partial" && ds.label !== "Partially Seen") return false;
      if (tab === "full" && ds.label !== "Fully Seen") return false;
      if (chartDeptFilter) {
        const key = normalizeDept(chartDeptFilter);
        const actorKey = normalizeDept(r.actor_department);
        const targetKeys = r.target_departments.map(normalizeDept);
        const payloadDept = deptOf(r);
        if (
          actorKey !== key &&
          !targetKeys.includes(key) &&
          normalizeDept(payloadDept) !== key
        ) {
          return false;
        }
      }
      if (chartStatusFilter === "seen" && !myReadIds.has(r.id)) return false;
      if (chartStatusFilter === "pending" && myReadIds.has(r.id)) return false;
      if (term) {
        const hay = [r.title, r.summary, r.record_ref, r.client_name, r.actor_user_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, moduleFilter, deptFilter, actorDeptFilter, fromDate, toDate, tab, myReadIds, q, readsByNotif, chartDeptFilter, chartStatusFilter]);

  async function acknowledge(n: NotifRow) {
    if (!me) return;
    const { error } = await supabase
      .from("app_notification_reads" as never)
      .upsert(
        {
          notification_id: n.id,
          user_id: me.id,
          user_name: me.name,
          department: me.department,
          seen_at: new Date().toISOString(),
        } as never,
        { onConflict: "notification_id,user_id" } as never,
      );
    if (error) {
      toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acknowledged" });
    await load();
  }

  // Summary counts
  const counts = useMemo(() => {
    let total = 0,
      newC = 0,
      ack = 0,
      pendingNotif = 0;
    let deptTotal = 0,
      deptSeen = 0,
      deptPending = 0;
    const byModule: Record<string, number> = {};
    rows.forEach((r) => {
      total++;
      if (myReadIds.has(r.id)) ack++;
      else newC++;
      const ds = deptStatus(r);
      deptTotal += ds.total;
      deptSeen += ds.seen;
      deptPending += ds.pending;
      if (ds.label === "Pending" || ds.label === "Partially Seen") pendingNotif++;
      byModule[r.module] = (byModule[r.module] || 0) + 1;
    });
    return { total, newC, ack, pendingNotif, deptTotal, deptSeen, deptPending, byModule };
  }, [rows, myReadIds, readsByNotif]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Cross-department change feed. Acknowledge items to mark them as seen.
          </p>
        </div>
        {isAdmin && rows.length > 0 && (
          <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Delete All Notifications
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you sure you want to delete all notifications?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes every notification record. Other data
                  (OA, BOQ, PI, PO, requisitions) is not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAll}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deletingAll}
                  onClick={(e) => {
                    e.preventDefault();
                    deleteAll();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deletingAll ? "Deleting…" : "Delete All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: "Total", value: counts.total },
          { label: "New", value: counts.newC, tone: "destructive" },
          { label: "Pending Ack", value: counts.pendingNotif },
          { label: "Acknowledged", value: counts.ack },
          { label: "Depts Notified", value: counts.deptTotal },
          { label: "Depts Pending", value: counts.deptPending, tone: "destructive" },
          { label: "Depts Acknowledged", value: counts.deptSeen },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div
                className={`text-xl font-bold ${
                  c.tone === "destructive" ? "text-destructive" : ""
                }`}
              >
                {c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Module-wise counts */}
      {Object.keys(counts.byModule).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts.byModule).map(([m, n]) => (
            <Badge key={m} variant="outline" className="text-xs">
              {m}: <span className="font-semibold ml-1">{n}</span>
            </Badge>
          ))}
        </div>
      )}

      <NotificationCharts
        rows={rows}
        myReadIds={myReadIds}
        activeDept={chartDeptFilter}
        activeStatus={chartStatusFilter}
        onDeptClick={(d) => setChartDeptFilter(d)}
        onStatusClick={(s) => setChartStatusFilter(s)}
      />

      {(chartDeptFilter || chartStatusFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active chart filter:</span>
          {chartDeptFilter && (
            <Badge variant="secondary" className="gap-1">
              Dept: {chartDeptFilter}
              <button
                onClick={() => setChartDeptFilter(null)}
                className="ml-1 hover:text-destructive"
                aria-label="Clear department filter"
              >
                ✕
              </button>
            </Badge>
          )}
          {chartStatusFilter && (
            <Badge variant="secondary" className="gap-1 capitalize">
              Status: {chartStatusFilter}
              <button
                onClick={() => setChartStatusFilter(null)}
                className="ml-1 hover:text-destructive"
                aria-label="Clear status filter"
              >
                ✕
              </button>
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => {
              setChartDeptFilter(null);
              setChartStatusFilter(null);
            }}
          >
            Clear Filter
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="new">New</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="ack">Acknowledged</TabsTrigger>
            <TabsTrigger value="partial">Partially Seen</TabsTrigger>
            <TabsTrigger value="full">Fully Seen</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-1">
          {modules.map((m) => (
            <Button
              key={m}
              size="sm"
              variant={moduleFilter === m ? "default" : "outline"}
              onClick={() => setModuleFilter(m)}
              className="h-7"
            >
              {m}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Target dept:</span>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2"
          >
            {allDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Changed by:</span>
          <select
            value={actorDeptFilter}
            onChange={(e) => setActorDeptFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2"
          >
            {actorDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">From:</span>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 w-36"
          />
          <span className="text-muted-foreground">To:</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 w-36"
          />
        </div>

        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search BOQ / OA / PO / client"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 w-72"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications ({visible.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No notifications.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Change</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead>Dept Status</TableHead>
                  <TableHead>My Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((n) => {
                  const seen = myReadIds.has(n.id);
                  const ds = deptStatus(n);
                  const fields = changedFields(n);
                  return (
                    <TableRow
                      key={n.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setOpenId(n.id)}
                    >
                      <TableCell className="max-w-[280px]">
                        <div className="font-medium truncate">{n.title}</div>
                        {n.summary && (
                          <div className="text-xs text-muted-foreground truncate">
                            {n.summary}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {n.module}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {n.record_ref || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{n.client_name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {n.actor_user_name || "—"}
                        {n.actor_department && (
                          <div className="text-muted-foreground">{n.actor_department}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(n.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="secondary">{fields.length} field(s)</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant={
                            ds.label === "Fully Seen"
                              ? "default"
                              : ds.label === "Pending"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ds.label}
                        </Badge>
                        <div className="text-muted-foreground mt-0.5">
                          {ds.seen}/{ds.total} seen · {ds.pending} pending
                        </div>
                      </TableCell>
                      <TableCell>
                        {seen ? (
                          <Badge>Seen</Badge>
                        ) : (
                          <Badge variant="destructive">New</Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!seen ? (
                          <Button size="sm" onClick={() => acknowledge(n)}>
                            <Check className="h-4 w-4 mr-1" /> Acknowledge
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenId(n.id)}
                          >
                            View
                          </Button>
                        )}
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="ml-1 text-destructive hover:text-destructive"
                                aria-label="Delete notification"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this notification?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the notification record only.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={(e) => {
                                    e.preventDefault();
                                    deleteOne(n.id);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Shared detail dialog (also reused by module-page banners) */}
      <NotificationDetailDialog
        notificationId={openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            if (searchParams.get("id")) {
              const next = new URLSearchParams(searchParams);
              next.delete("id");
              setSearchParams(next, { replace: true });
            }
          }
        }}
        onAcknowledged={() => load()}
      />
    </div>
  );
}
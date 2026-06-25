import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  PenSquare,
  Calculator,
  ShoppingCart,
  Factory,
  ClipboardList,
  FolderKanban,
  FileText,
  Eye,
  Filter as FilterIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { NotificationDetailDialog } from "@/components/notifications/NotificationDetailDialog";
import { deptOf } from "@/components/notifications/NotificationCharts";
import { DeptNotificationsDialog } from "@/components/notifications/DeptNotificationsDialog";
import { canAckClient, markNotificationSeen, normalizeDept } from "@/lib/notifications/dept";
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

// Only these departments/categories are surfaced in the dashboard's
// department section, filter dropdown, and pie chart.
const ALLOWED_DEPTS = [
  "Design",
  "Costing",
  "OA",
  "BOQ",
  "PI",
  "Purchase",
  "Manufacturing",
  "Requisition",
  "Project",
];
const ALLOWED_DEPT_KEYS = new Set(ALLOWED_DEPTS.map((d) => normalizeDept(d)));

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
  related_boq_id?: string | null;
  related_order_root_id?: string | null;
  related_pi_id?: string | null;
  revision_key?: string | null;
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
  kind?: "seen" | "ack";
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

// ---- Group / module helpers for the redesigned dashboard ----

/** Map a raw module code to one of the 6 dashboard groups (or null). */
function groupOf(module: string | null | undefined): string | null {
  const m = (module || "").toLowerCase();
  if (!m) return null;
  if (m.startsWith("design")) return "Design";
  if (m === "oa" || m === "order" || m.startsWith("order")) return "Costing";
  if (m === "boq" || m.startsWith("boq")) return "Costing";
  if (m === "pi" || m.startsWith("pi") || m.startsWith("proforma")) return "Costing";
  if (m.startsWith("purchase") || m === "po") return "Purchase";
  if (m.startsWith("manufactur") || m === "mfg") return "Manufacturing";
  if (m.startsWith("requisition") || m === "req" || m === "pr") return "Requisition";
  if (m.startsWith("project")) return "Project";
  return null;
}

/** Sub-group inside Costing: OA / BOQ / PI. */
function costingSub(module: string | null | undefined): "OA" | "BOQ" | "PI" | null {
  const m = (module || "").toLowerCase();
  if (m === "oa" || m === "order" || m.startsWith("order")) return "OA";
  if (m === "boq" || m.startsWith("boq")) return "BOQ";
  if (m === "pi" || m.startsWith("pi") || m.startsWith("proforma")) return "PI";
  return null;
}

/** Short pretty module badge label. */
function moduleBadge(module: string): string {
  const m = (module || "").toLowerCase();
  if (m === "oa" || m.startsWith("order")) return "OA";
  if (m.startsWith("boq")) return "BOQ";
  if (m.startsWith("pi") || m.startsWith("proforma")) return "PI";
  if (m.startsWith("purchase") || m === "po") return "Purchase";
  if (m.startsWith("manufactur") || m === "mfg") return "Manufacturing";
  if (m.startsWith("requisition") || m === "req") return "Requisition";
  if (m.startsWith("design")) return "Design";
  if (m.startsWith("project")) return "Project";
  return module.toUpperCase();
}

/** Best-effort revision string ("R0", "R1", …) from the notification payload. */
function revOf(n: NotifRow): string {
  const v = (n.new_value || {}) as Record<string, unknown>;
  const cand =
    (v.revision_no as unknown) ??
    (v.revision as unknown) ??
    (v.rev as unknown) ??
    (v.version as unknown);
  if (cand === null || cand === undefined || cand === "") return "R0";
  const s = String(cand);
  return /^r\d+/i.test(s) ? s.toUpperCase() : `R${s}`;
}

/** Pretty value renderer for old/new cells. */
function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

interface LineLike {
  line_no?: string | number | null;
  kind?: "added" | "removed" | "modified";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  changed_fields?: string[];
}

/**
 * Pick the most representative single change for the table row:
 * - prefer the first line-item change
 * - else fall back to the first changed top-level field
 */
function rowChange(n: NotifRow): {
  lineNo: string;
  field: string;
  oldVal: string;
  newVal: string;
} {
  const lic = Array.isArray(n.line_item_changes)
    ? (n.line_item_changes as LineLike[])
    : [];
  if (lic.length > 0) {
    const lc = lic[0];
    const lineNo =
      lc.line_no === null || lc.line_no === undefined || lc.line_no === ""
        ? "—"
        : String(lc.line_no);
    const cf = (lc.changed_fields || []).filter((k) => !HIDDEN_FIELDS.has(k));
    if (lc.kind === "added") {
      return { lineNo, field: "Item Added", oldVal: "—", newVal: "Added" };
    }
    if (lc.kind === "removed") {
      return { lineNo, field: "Item Removed", oldVal: "Removed", newVal: "—" };
    }
    const k = cf[0];
    if (k) {
      const before = (lc.before || {}) as Record<string, unknown>;
      const after = (lc.after || {}) as Record<string, unknown>;
      return {
        lineNo,
        field: labelOf(k),
        oldVal: fmtVal(before[k]),
        newVal: fmtVal(after[k]),
      };
    }
    return { lineNo, field: "Line Item Changed", oldVal: "—", newVal: "—" };
  }

  // Header-level change
  if (n.event_type === "comment_added" || n.event_type === "comment_updated") {
    const nv = (n.new_value || {}) as Record<string, unknown>;
    const ov = (n.old_value || {}) as Record<string, unknown>;
    return {
      lineNo: "Header",
      field: "Comment",
      oldVal: fmtVal(ov.old_comment),
      newVal: fmtVal(nv.new_comment),
    };
  }
  const fields = changedFields(n);
  const k = fields[0];
  if (k) {
    const o = (n.old_value || {}) as Record<string, unknown>;
    const v = (n.new_value || {}) as Record<string, unknown>;
    return {
      lineNo: "Header",
      field: labelOf(k),
      oldVal: fmtVal(o[k]),
      newVal: fmtVal(v[k]),
    };
  }
  return { lineNo: "Header", field: "—", oldVal: "—", newVal: "—" };
}

/** Notification type pill shown in the right column. */
function notifTypeLabel(n: NotifRow): string {
  const e = n.event_type || "";
  if (e === "comment_added" || e === "comment_updated") return "Design Comment";
  if ((n.module || "").toLowerCase().startsWith("design")) return "Design Update";
  return "Data Change";
}

/** Group definitions used for the top cards row. */
const GROUPS: Array<{ key: string; label: string; icon: typeof PenSquare }> = [
  { key: "Design", label: "Design", icon: PenSquare },
  { key: "Costing", label: "Costing (Total)", icon: Calculator },
  { key: "Purchase", label: "Purchase", icon: ShoppingCart },
  { key: "Manufacturing", label: "Manufacturing", icon: Factory },
  { key: "Requisition", label: "Requisition", icon: ClipboardList },
  { key: "Project", label: "Project", icon: FolderKanban },
];

const COSTING_SUBS: Array<{ key: "OA" | "BOQ" | "PI"; label: string }> = [
  { key: "OA", label: "OA" },
  { key: "BOQ", label: "BOQ" },
  { key: "PI", label: "PI" },
];

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
  const [deptDrill, setDeptDrill] = useState<{ dept: string; mode: "all" | "seen" } | null>(null);
  // Extra filters for the redesigned dashboard.
  const [expandCosting, setExpandCosting] = useState(true);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [notifTypeFilter, setNotifTypeFilter] = useState<string>("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

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
    const currentMe = uid ? { id: uid, name: myName, department: myDept } : null;
    setMe(currentMe);

    const { data: n } = await supabase
      .from("app_notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    const fetched = ((n || []) as unknown as NotifRow[]).filter(hasRealChange);
    const fetchedByDocument = Array.from(
      fetched
        .reduce((m, n) => {
          const key =
            n.record_ref
              ? [n.module, n.record_ref].join("|")
              : n.revision_key || [n.module, n.record_id || n.id].join("|");
          const existing = m.get(key);
          if (!existing) {
            m.set(key, n);
            return m;
          }

          const mergedTargets = Array.from(
            new Set([...(existing.target_departments || []), ...(n.target_departments || [])]),
          );
          const mergedChanges = [
            ...(Array.isArray(existing.line_item_changes) ? existing.line_item_changes : []),
            ...(Array.isArray(n.line_item_changes) ? n.line_item_changes : []),
          ];
          const preferN =
            (currentMe && canAckClient(n, currentMe) && !canAckClient(existing, currentMe)) ||
            (!currentMe && new Date(n.created_at) > new Date(existing.created_at));
          const base = preferN ? n : existing;
          m.set(key, {
            ...base,
            target_departments: mergedTargets,
            line_item_changes: mergedChanges,
          });
          return m;
        }, new Map<string, NotifRow>())
        .values(),
    );
    setRows(fetchedByDocument);

    const ids = fetchedByDocument.map((r) => r.id);
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
    setLastUpdated(new Date());
  }

  useEffect(() => {
    load();
  }, []);

  // Realtime: refresh when notifications or acknowledgements change anywhere.
  useEffect(() => {
    const channel = supabase
      .channel("notif-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_notification_reads" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_notifications" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
    rows.forEach((r) =>
      r.target_departments.forEach((d) => {
        if (ALLOWED_DEPT_KEYS.has(normalizeDept(d))) s.add(d);
      }),
    );
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
    const filterBoq = searchParams.get("boq");
    const filterOa = searchParams.get("oa");
    const filterPi = searchParams.get("pi");
    const unseenOnly = searchParams.get("unseen") === "1";
    return rows.filter((r) => {
      if (filterBoq && r.related_boq_id !== filterBoq) return false;
      if (filterOa && r.related_order_root_id !== filterOa) return false;
      if (filterPi && r.related_pi_id !== filterPi) return false;
      if (unseenOnly && me && myReadIds.has(r.id)) return false;
      if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
      if (docTypeFilter !== "all") {
        const mb = moduleBadge(r.module).toLowerCase();
        if (mb !== docTypeFilter.toLowerCase()) return false;
      }
      if (notifTypeFilter !== "all" && notifTypeLabel(r) !== notifTypeFilter) {
        return false;
      }
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
  }, [rows, moduleFilter, deptFilter, actorDeptFilter, fromDate, toDate, tab, myReadIds, q, readsByNotif, chartDeptFilter, chartStatusFilter, searchParams, me]);

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
          kind: "ack",
          seen_at: new Date().toISOString(),
        } as never,
        { onConflict: "notification_id,user_id,kind" } as never,
      );
    if (error) {
      toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acknowledged" });
    await load();
  }

  async function markSeen(n: NotifRow) {
    if (!me) return;
    if (!canAckClient(n, me)) {
      toast({ title: "Only target department users can mark this as seen" });
      return;
    }
    const ok = await markNotificationSeen(n.id);
    if (!ok) {
      toast({ title: "Could not mark as seen", variant: "destructive" });
      return;
    }
    const now = new Date().toISOString();
    setReads((prev) => {
      const exists = prev.some(
        (r) => r.notification_id === n.id && r.user_id === me.id && r.kind === "seen",
      );
      if (exists) return prev;
      return [
        ...prev,
        {
          notification_id: n.id,
          user_id: me.id,
          user_name: me.name,
          department: me.department,
          seen_at: now,
          kind: "seen",
        },
      ];
    });
    toast({ title: "Marked as seen" });
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
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Advanced Notification Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Complete overview of all notifications across key modules.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground hidden md:block">
            Last updated:{" "}
            {lastUpdated.toLocaleString(undefined, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <Button size="sm" variant="outline" onClick={() => load()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          {isAdmin && rows.length > 0 && (
            <AlertDialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all notifications?</AlertDialogTitle>
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
      </div>

      {/* Deep-link filter banner */}
      {(() => {
        const fBoq = searchParams.get("boq");
        const fOa = searchParams.get("oa");
        const fPi = searchParams.get("pi");
        const fUnseen = searchParams.get("unseen") === "1";
        if (!fBoq && !fOa && !fPi && !fUnseen) return null;
        const parts: string[] = [];
        if (fBoq) parts.push("BOQ");
        if (fOa) parts.push("OA");
        if (fPi) parts.push("PI");
        if (fUnseen) parts.push("Unseen only");
        return (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span className="font-medium">Filtered by:</span>
            <span className="text-muted-foreground">{parts.join(" · ")}</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7"
              onClick={() => setSearchParams({})}
            >
              Clear
            </Button>
          </div>
        );
      })()}

      {/* Top group cards */}
      {(() => {
        // Compute totals per group from rows + reads.
        type GS = { total: number; seen: number };
        const groupStats: Record<string, GS> = {};
        const costingSubStats: Record<"OA" | "BOQ" | "PI", GS> = {
          OA: { total: 0, seen: 0 },
          BOQ: { total: 0, seen: 0 },
          PI: { total: 0, seen: 0 },
        };
        for (const g of GROUPS) groupStats[g.key] = { total: 0, seen: 0 };
        for (const r of rows) {
          const g = groupOf(r.module);
          if (!g) continue;
          const seen = myReadIds.has(r.id);
          groupStats[g].total += 1;
          if (seen) groupStats[g].seen += 1;
          if (g === "Costing") {
            const sub = costingSub(r.module);
            if (sub) {
              costingSubStats[sub].total += 1;
              if (seen) costingSubStats[sub].seen += 1;
            }
          }
        }

        function applyGroupFilter(key: string, mode: "all" | "seen" | "notseen") {
          // Map group → module set via docTypeFilter / moduleFilter combos.
          if (key === "Costing") {
            setDocTypeFilter("all");
            setModuleFilter("all");
            // Costing combines OA/BOQ/PI — leave broader filters and use tab.
          } else if (key === "Design") {
            setDocTypeFilter("Design");
            setModuleFilter("all");
          } else if (key === "Purchase") {
            setDocTypeFilter("Purchase");
            setModuleFilter("all");
          } else if (key === "Manufacturing") {
            setDocTypeFilter("Manufacturing");
            setModuleFilter("all");
          } else if (key === "Requisition") {
            setDocTypeFilter("Requisition");
            setModuleFilter("all");
          } else if (key === "Project") {
            setDocTypeFilter("Project");
            setModuleFilter("all");
          }
          setTab(mode === "seen" ? "ack" : mode === "notseen" ? "new" : "all");
        }

        function applyCostingSub(sub: "OA" | "BOQ" | "PI", mode: "all" | "seen" | "notseen") {
          setDocTypeFilter(sub);
          setModuleFilter("all");
          setTab(mode === "seen" ? "ack" : mode === "notseen" ? "new" : "all");
        }

        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {GROUPS.map(({ key, label, icon: Icon }) => {
                const s = groupStats[key];
                const notSeen = Math.max(0, s.total - s.seen);
                const isCosting = key === "Costing";
                const active = isCosting && expandCosting;
                return (
                  <Card
                    key={key}
                    className={`relative overflow-hidden border ${
                      active ? "border-primary/40 bg-primary/5" : "hover:border-primary/30"
                    } transition-colors`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-md bg-muted p-1.5">
                            <Icon className="h-4 w-4 text-foreground/70" />
                          </div>
                          <div className="text-sm font-semibold">{label}</div>
                        </div>
                        {isCosting ? (
                          <button
                            type="button"
                            onClick={() => setExpandCosting((v) => !v)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Toggle costing breakdown"
                          >
                            {expandCosting ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => applyGroupFilter(key, "all")}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={`Filter by ${label}`}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => applyGroupFilter(key, "all")}
                        className="block text-left"
                      >
                        <div className="text-3xl font-bold leading-none">{s.total}</div>
                        <div className="text-xs text-muted-foreground mt-1">Total</div>
                      </button>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                        <button
                          type="button"
                          onClick={() => applyGroupFilter(key, "seen")}
                          className="text-left"
                        >
                          <div className="text-lg font-semibold text-emerald-600">
                            {s.seen}
                          </div>
                          <div className="text-[11px] text-muted-foreground">Seen</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => applyGroupFilter(key, "notseen")}
                          className="text-left"
                        >
                          <div className="text-lg font-semibold text-destructive">
                            {notSeen}
                          </div>
                          <div className="text-[11px] text-muted-foreground">Not Seen</div>
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Costing breakdown: OA / BOQ / PI */}
            {expandCosting && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:max-w-2xl md:ml-[16.6%]">
                {COSTING_SUBS.map(({ key, label }) => {
                  const s = costingSubStats[key];
                  const notSeen = Math.max(0, s.total - s.seen);
                  return (
                    <Card key={key} className="border-dashed">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold">{label}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => applyCostingSub(key, "all")}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <button
                            type="button"
                            onClick={() => applyCostingSub(key, "all")}
                            className="rounded-md p-1 hover:bg-muted"
                          >
                            <div className="text-base font-bold">{s.total}</div>
                            <div className="text-[10px] text-muted-foreground">Total</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCostingSub(key, "seen")}
                            className="rounded-md p-1 hover:bg-muted"
                          >
                            <div className="text-base font-bold text-emerald-600">{s.seen}</div>
                            <div className="text-[10px] text-muted-foreground">Seen</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCostingSub(key, "notseen")}
                            className="rounded-md p-1 hover:bg-muted"
                          >
                            <div className="text-base font-bold text-destructive">{notSeen}</div>
                            <div className="text-[10px] text-muted-foreground">Not Seen</div>
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              Click on any count to view details
            </div>
          </div>
        );
      })()}

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Module / Group</label>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m === "all" ? "All" : moduleBadge(m)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Document Type</label>
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="OA">OA</option>
                <option value="BOQ">BOQ</option>
                <option value="PI">PI</option>
                <option value="Purchase">Purchase</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Requisition">Requisition</option>
                <option value="Design">Design</option>
                <option value="Project">Project</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Seen / Not Seen</label>
              <select
                value={tab === "ack" ? "seen" : tab === "new" ? "notseen" : "all"}
                onChange={(e) => {
                  const v = e.target.value;
                  setTab(v === "seen" ? "ack" : v === "notseen" ? "new" : "all");
                }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="seen">Seen</option>
                <option value="notseen">Not Seen</option>
              </select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs text-muted-foreground">Date Range</label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9"
                />
                <span className="text-muted-foreground text-xs">—</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Edited By</label>
              <select
                value={actorDeptFilter}
                onChange={(e) => setActorDeptFilter(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {actorDepts.map((d) => (
                  <option key={d} value={d}>
                    {d === "all" ? "All" : d}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Document No.</label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search document no."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notification Type</label>
              <select
                value={notifTypeFilter}
                onChange={(e) => setNotifTypeFilter(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="Data Change">Data Change</option>
                <option value="Design Comment">Design Comment</option>
                <option value="Design Update">Design Update</option>
              </select>
            </div>
            <div className="flex items-center gap-2 md:col-span-2 lg:col-span-1 lg:justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setModuleFilter("all");
                  setDocTypeFilter("all");
                  setNotifTypeFilter("all");
                  setActorDeptFilter("all");
                  setDeptFilter("all");
                  setFromDate("");
                  setToDate("");
                  setQ("");
                  setTab("all");
                  setChartDeptFilter(null);
                  setChartStatusFilter(null);
                  setSearchParams({});
                }}
              >
                Clear
              </Button>
              <Button size="sm" className="gap-1">
                <FilterIcon className="h-3.5 w-3.5" /> Apply Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Notifications table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">
              Recent Notifications{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({tab === "new" ? "Not Seen" : tab === "ack" ? "Seen" : "All"})
              </span>{" "}
              <Badge variant="secondary" className="ml-1">
                {visible.length}
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No notifications match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Document No.</TableHead>
                    <TableHead>Rev</TableHead>
                    <TableHead>Line Item</TableHead>
                    <TableHead>Field / Option Edited</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>New Value</TableHead>
                    <TableHead>Edited By</TableHead>
                    <TableHead>Edited On</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((n) => {
                    const seen = myReadIds.has(n.id);
                    const change = rowChange(n);
                    const type = notifTypeLabel(n);
                    const mb = moduleBadge(n.module);
                    return (
                      <TableRow
                        key={n.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setOpenId(n.id)}
                      >
                        <TableCell>
                          <Badge variant="outline" className="font-medium">
                            {mb}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {n.record_ref || "—"}
                        </TableCell>
                        <TableCell className="text-xs">{revOf(n)}</TableCell>
                        <TableCell className="text-xs">{change.lineNo}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">
                          {change.field}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate text-destructive/90">
                          {change.oldVal}
                        </TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate text-emerald-700">
                          {change.newVal}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {n.actor_user_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(n.created_at).toLocaleString(undefined, {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              type === "Design Comment"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : type === "Design Update"
                                  ? "border-violet-300 bg-violet-50 text-violet-700"
                                  : "border-sky-300 bg-sky-50 text-sky-700"
                            }
                          >
                            {type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {seen ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Seen</Badge>
                          ) : (
                            <Badge variant="destructive">Not Seen</Badge>
                          )}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {!seen && canAckClient(n, me) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => markSeen(n)}
                              >
                                Seen
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => setOpenId(n.id)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                            {isAdmin && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-destructive hover:text-destructive"
                                    aria-label="Delete notification"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete this notification?
                                    </AlertDialogTitle>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-through dialogs */}
      <DeptNotificationsDialog
        department={deptDrill?.dept || null}
        mode={deptDrill?.mode || "all"}
        rows={rows}
        readsByNotif={readsByNotif}
        open={!!deptDrill}
        onOpenChange={(o) => {
          if (!o) setDeptDrill(null);
        }}
      />

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

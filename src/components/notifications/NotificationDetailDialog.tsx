import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Check,
  Loader2,
  Bell,
  RefreshCw,
  FileText,
  PenSquare,
  ShoppingCart,
  Factory,
  Receipt,
  History,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { normalizeDept, matchTargetDept } from "@/lib/notifications/dept";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface NotifFull {
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
  related_order_root_id?: string | null;
  related_boq_id?: string | null;
  related_pi_id?: string | null;
  related_po_id?: string | null;
  related_requisition_id?: string | null;
  related_annexure_id?: string | null;
  line_item_changes?: LineChange[] | null;
}

export interface LineChange {
  line_no?: string | number | null;
  kind: "added" | "removed" | "modified";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changed_fields: string[];
}

interface ReadRow {
  notification_id: string;
  user_id: string;
  user_name: string | null;
  department: string | null;
  seen_at: string;
}

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
  "line_items",
]);

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
  quantity: "Qty",
  rate: "Rate",
  amount: "Amount",
  model_number: "Model",
  model: "Model",
  description: "Description",
  unit: "Unit",
  motor: "Motor",
  motor_qty: "Motor Qty",
  remarks: "Remarks",
  make: "Make",
  material: "Material",
  size_model: "Size / Model",
  boq_date: "BOQ Date",
  oa_date: "OA Date",
  pi_date: "PI Date",
  po_date: "PO Date",
  item_no: "Item No",
};

function labelOf(k: string) {
  return (
    FIELD_LABELS[k] ||
    k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function isUuid(v: unknown): boolean {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function truncate(v: unknown, n = 200): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function changedTopFields(n: NotifFull): string[] {
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

interface Props {
  notificationId: string | null;
  onOpenChange: (open: boolean) => void;
  onAcknowledged?: () => void;
}

/**
 * Shared detail dialog for a single notification. Used by the Notification
 * Dashboard and by each module-page banner so dashboard and pages stay in
 * sync (same notification, same acknowledgement record).
 */
export function NotificationDetailDialog({
  notificationId,
  onOpenChange,
  onAcknowledged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<NotifFull | null>(null);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [history, setHistory] = useState<NotifFull[]>([]);
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(
    null,
  );
  const [ackDept, setAckDept] = useState<string>("");

  const load = useCallback(async () => {
    if (!notificationId) return;
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
      .eq("id", notificationId)
      .maybeSingle();
    setNotif((n as NotifFull | null) ?? null);

    const { data: r } = await supabase
      .from("app_notification_reads" as never)
      .select("*")
      .eq("notification_id", notificationId);
    setReads(((r || []) as unknown as ReadRow[]) || []);

    // Pull every prior/sibling notification for the same source record so we
    // can aggregate a Line Item Change History on this dialog. Group by
    // record_ref when available, else by record_id.
    const current = (n as NotifFull | null) ?? null;
    if (current) {
      let q = supabase
        .from("app_notifications" as never)
        .select(
          "id,actor_user_name,actor_department,created_at,line_item_changes,record_ref,record_id",
        );
      if (current.record_ref) q = q.eq("record_ref", current.record_ref);
      else if (current.record_id) q = q.eq("record_id", current.record_id);
      else q = q.eq("id", current.id);
      const { data: h } = await q.order("created_at", { ascending: true });
      setHistory(((h || []) as unknown as NotifFull[]) || []);
    } else {
      setHistory([]);
    }
    setLoading(false);
  }, [notificationId]);

  useEffect(() => {
    if (notificationId) load();
    else {
      setNotif(null);
      setReads([]);
      setHistory([]);
    }
  }, [notificationId, load]);

  // Pick a sensible default for the acknowledgement-department selector:
  // prefer the user's own department if it matches a target, else first target.
  useEffect(() => {
    if (!notif || !me) return;
    const matched = matchTargetDept(me.department, notif.target_departments);
    setAckDept(matched || notif.target_departments[0] || me.department);
  }, [notif, me]);

  async function acknowledge() {
    if (!me || !notif) return;
    const dept = ackDept || me.department;
    const { error } = await supabase
      .from("app_notification_reads" as never)
      .upsert(
        {
          notification_id: notif.id,
          user_id: me.id,
          user_name: me.name,
          department: dept,
          seen_at: new Date().toISOString(),
        } as never,
        { onConflict: "notification_id,user_id" } as never,
      );
    if (error) {
      toast({
        title: "Could not acknowledge",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Acknowledged" });
    onAcknowledged?.();
    await load();
  }

  const myRead = me ? reads.find((r) => r.user_id === me.id) : null;
  const lineChanges: LineChange[] = Array.isArray(notif?.line_item_changes)
    ? (notif!.line_item_changes as LineChange[])
    : [];

  return (
    <Dialog open={!!notificationId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 bg-muted/30">
        {loading || !notif ? (
          <div className="py-20 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <NotificationDetailBody
            notif={notif}
            reads={reads}
            lineChanges={lineChanges}
            history={history}
            me={me}
            myRead={myRead}
            ackDept={ackDept}
            setAckDept={setAckDept}
            acknowledge={acknowledge}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- New visual layout ---------------- */

function pickStr(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function HeaderCard({ notif }: { notif: NotifFull }) {
  const nv = notif.new_value || {};
  const ov = notif.old_value || {};
  const oaNo = pickStr(nv, ["oa_no"]) || pickStr(ov, ["oa_no"]);
  const boqNo = pickStr(nv, ["boq_no"]) || pickStr(ov, ["boq_no"]);
  const piNo = pickStr(nv, ["pi_no"]) || pickStr(ov, ["pi_no"]);
  const csNo =
    pickStr(nv, ["cost_sheet_no", "cs_no"]) ||
    pickStr(ov, ["cost_sheet_no", "cs_no"]);
  const summary =
    notif.summary ||
    (notif.line_item_changes && notif.line_item_changes.length
      ? `${notif.line_item_changes.length} line item change(s)`
      : notif.event_type.replace(/_/g, " "));

  const Row = ({ label, value }: { label: string; value: string | null }) =>
    value ? (
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground">{value}</div>
      </div>
    ) : null;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-500">
          <Bell className="h-5 w-5" />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Title</div>
            <div className="text-base font-bold leading-tight">{notif.title}</div>
          </div>
          <Row label="Cost Sheet No" value={csNo} />
          <div>
            <div className="text-[11px] text-muted-foreground">Edited By</div>
            <div className="text-sm font-semibold">
              {(notif.actor_department || "—") +
                (notif.actor_user_name ? ` / ${notif.actor_user_name}` : "")}
            </div>
          </div>
          <Row label="OA No" value={oaNo} />
          <Row label="Client" value={notif.client_name} />
          <div>
            <div className="text-[11px] text-muted-foreground">Edited On</div>
            <div className="text-sm font-semibold">
              {new Date(notif.created_at).toLocaleString()}
            </div>
          </div>
          <Row label="BOQ No" value={boqNo} />
          <Row label="PI No" value={piNo} />
          <div>
            <div className="text-[11px] text-muted-foreground">Short summary</div>
            <div className="text-sm font-semibold">{summary}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineItemDetailsTable({ changes }: { changes: LineChange[] }) {
  if (!changes.length) return null;
  const cols = ["Item", "Field / Cell", "Old Value", "New Value", "Status"];
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 text-sm font-bold">Line Item Details</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {changes.flatMap((c, i) => {
              const lineNo = c.line_no ?? i + 1;
              const before = (c.before || {}) as Record<string, unknown>;
              const after = (c.after || {}) as Record<string, unknown>;
              const refName =
                String(after["description"] ?? before["description"] ?? after["size_model"] ?? before["size_model"] ?? "") || "";
              const itemCell = (
                <>
                  <div className="font-semibold">Item {lineNo}</div>
                  {refName && <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{refName}</div>}
                </>
              );
              const statusBadge =
                c.kind === "added"
                  ? { cls: "bg-emerald-100 text-emerald-700", label: "Added" }
                  : c.kind === "removed"
                    ? { cls: "bg-red-100 text-red-700", label: "Removed" }
                    : { cls: "bg-orange-100 text-orange-700", label: "Changed" };
              const badge = (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              );
              if (c.kind !== "modified") {
                return [
                  <tr key={`${i}`} className="border-t align-top">
                    <td className="px-3 py-2">{itemCell}</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.kind === "added" ? "—" : truncate(before)}</td>
                    <td className="px-3 py-2">{c.kind === "removed" ? "—" : truncate(after)}</td>
                    <td className="px-3 py-2">{badge}</td>
                  </tr>,
                ];
              }
              const fields = (c.changed_fields || []).filter((f) => !HIDDEN_FIELDS.has(f) && !f.endsWith("_id"));
              if (!fields.length) {
                return [
                  <tr key={`${i}`} className="border-t align-top">
                    <td className="px-3 py-2">{itemCell}</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-muted-foreground">—</td>
                    <td className="px-3 py-2">{badge}</td>
                  </tr>,
                ];
              }
              return fields.map((f, j) => (
                <tr key={`${i}-${f}`} className="border-t align-top">
                  {j === 0 ? (
                    <td className="px-3 py-2" rowSpan={fields.length}>{itemCell}</td>
                  ) : null}
                  <td className="px-3 py-2 font-medium">{labelOf(f)}</td>
                  <td className="px-3 py-2 text-muted-foreground line-through">{truncate(before[f])}</td>
                  <td className="px-3 py-2 text-foreground font-medium">{truncate(after[f])}</td>
                  {j === 0 ? (
                    <td className="px-3 py-2" rowSpan={fields.length}>{badge}</td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangedLineItemsHistory({
  notif,
  history,
}: {
  notif: NotifFull;
  history: NotifFull[];
}) {
  type Edit = {
    field: string;
    oldV: unknown;
    newV: unknown;
    by: string;
    dept: string | null;
    when: string;
  };

  // Merge current notification with history, dedupe by id, sort by created_at.
  const seen = new Set<string>();
  const all: NotifFull[] = [];
  for (const h of [notif, ...(history || [])]) {
    if (!h || seen.has(h.id)) continue;
    seen.add(h.id);
    all.push(h);
  }
  all.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  const byLine = new Map<string, Edit[]>();
  for (const h of all) {
    const changes = Array.isArray(h.line_item_changes)
      ? (h.line_item_changes as LineChange[])
      : [];
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      const lineNo = String(c.line_no ?? i + 1);
      const base = {
        by: h.actor_user_name || "—",
        dept: h.actor_department || null,
        when: h.created_at,
      };
      const pushEdit = (e: Edit) => {
        if (!byLine.has(lineNo)) byLine.set(lineNo, []);
        byLine.get(lineNo)!.push(e);
      };
      if (c.kind === "modified") {
        for (const f of c.changed_fields || []) {
          const oldV = (c.before || {})[f];
          const newV = (c.after || {})[f];
          if (JSON.stringify(oldV ?? null) === JSON.stringify(newV ?? null)) continue;
          pushEdit({ ...base, field: f, oldV, newV });
        }
      } else if (c.kind === "added") {
        pushEdit({ ...base, field: "status", oldV: "—", newV: "Added" });
      } else if (c.kind === "removed") {
        pushEdit({ ...base, field: "status", oldV: "Present", newV: "Removed" });
      }
    }
  }

  // Drop empty lines, sort edits within line, sort lines numerically.
  const lines = Array.from(byLine.entries())
    .filter(([, edits]) => edits.length > 0)
    .map(([lineNo, edits]) => {
      edits.sort((a, b) => (a.when || "").localeCompare(b.when || ""));
      return [lineNo, edits] as const;
    })
    .sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0));

  // Top-level (non line-item) changed fields as a fallback when no line edits.
  const topFields = changedTopFields(notif);

  if (lines.length === 0 && topFields.length === 0) return null;

  // Build the record reference line (OA / BOQ / PI).
  const nv = notif.new_value || {};
  const ov = notif.old_value || {};
  const refs: string[] = [];
  const oa = pickStr(nv, ["oa_no"]) || pickStr(ov, ["oa_no"]);
  const boq = pickStr(nv, ["boq_no"]) || pickStr(ov, ["boq_no"]);
  const pi = pickStr(nv, ["pi_no"]) || pickStr(ov, ["pi_no"]);
  if (oa) refs.push(`OA: ${oa}`);
  if (boq) refs.push(`BOQ: ${boq}`);
  if (pi) refs.push(`PI: ${pi}`);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-bold">Change Details</div>
        {refs.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {refs.join("   /   ")}
          </span>
        )}
      </div>

      {lines.length > 0 ? (
        <div className="space-y-4">
          {lines.map(([lineNo, edits]) => (
            <div key={lineNo} className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs">
                <div className="font-semibold">Line Item {lineNo}</div>
                <div className="text-muted-foreground">
                  Edited {edits.length} time{edits.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="divide-y">
                {edits.map((e, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 gap-x-6 gap-y-1 px-3 py-2 text-xs sm:grid-cols-2"
                  >
                    <div>
                      <span className="text-muted-foreground">Changed Cell: </span>
                      <span className="font-medium">{labelOf(e.field)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Changed By: </span>
                      <span className="font-medium">
                        {e.by}
                        {e.dept ? (
                          <span className="text-muted-foreground"> ({e.dept})</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="break-words">
                      <span className="text-muted-foreground">Old Value: </span>
                      <span className="text-red-600 line-through">
                        {truncate(e.oldV, 200)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Changed At: </span>
                      <span className="whitespace-nowrap">
                        {new Date(e.when).toLocaleString()}
                      </span>
                    </div>
                    <div className="break-words sm:col-span-2">
                      <span className="text-muted-foreground">New Value: </span>
                      <span className="text-emerald-700">
                        {truncate(e.newV, 200)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Header fields changed
          </div>
          {topFields.map((k) => (
            <div
              key={k}
              className="grid grid-cols-12 gap-2 rounded border px-3 py-2 text-xs"
            >
              <div className="col-span-3 font-medium">{labelOf(k)}</div>
              <div className="col-span-4 break-words text-red-600 line-through">
                {truncate((ov as Record<string, unknown>)[k], 200)}
              </div>
              <div className="col-span-1 text-center text-muted-foreground">→</div>
              <div className="col-span-4 break-words text-emerald-700">
                {truncate((nv as Record<string, unknown>)[k], 200)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bottom department-status chips, matching the screenshot. */
const CHIP_DEFS: {
  label: string;
  aliases: string[];
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    label: "Order/OA",
    aliases: ["costing", "order", "orders", "oa", "order/oa"],
    Icon: RefreshCw,
  },
  { label: "BOQ", aliases: ["boq", "boqs"], Icon: FileText },
  { label: "Design", aliases: ["design"], Icon: PenSquare },
  { label: "Purchase", aliases: ["purchase", "purchasing"], Icon: ShoppingCart },
  {
    label: "Manufacturing",
    aliases: ["manufacturing", "production", "factory"],
    Icon: Factory,
  },
  { label: "PI", aliases: ["pi", "proforma", "proforma invoice"], Icon: Receipt },
];

function chipStatus(
  notif: NotifFull,
  reads: ReadRow[],
  aliases: string[],
): { text: string; cls: string } {
  const isMatch = (s: string | null | undefined) => {
    const k = normalizeDept(s);
    return !!k && aliases.includes(k);
  };
  // Actor's own department -> Revised
  if (isMatch(notif.actor_department)) {
    return { text: "Revised", cls: "text-blue-600" };
  }
  // Any acknowledger from this dept -> Seen
  if (reads.some((r) => isMatch(r.department))) {
    return { text: "Seen", cls: "text-emerald-600" };
  }
  // Targeted but not yet read
  const targeted = notif.target_departments.some((t) => isMatch(t));
  if (targeted) {
    return { text: "Not Seen", cls: "text-red-600" };
  }
  // Otherwise pending / informational
  return { text: "Pending", cls: "text-orange-600" };
}

function StatusChipBar({
  notif,
  reads,
}: {
  notif: NotifFull;
  reads: ReadRow[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHIP_DEFS.map(({ label, aliases, Icon }) => {
        const s = chipStatus(notif, reads, aliases);
        return (
          <div
            key={label}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs shadow-sm"
          >
            <Icon className={`h-3.5 w-3.5 ${s.cls}`} />
            <span className="text-muted-foreground">{label}:</span>
            <span className={`font-semibold ${s.cls}`}>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function NotificationDetailBody({
  notif,
  reads,
  lineChanges,
  history,
  me,
  myRead,
  ackDept,
  setAckDept,
  acknowledge,
}: {
  notif: NotifFull;
  reads: ReadRow[];
  lineChanges: LineChange[];
  history: NotifFull[];
  me: { id: string; name: string; department: string } | null;
  myRead: ReadRow | null | undefined;
  ackDept: string;
  setAckDept: (v: string) => void;
  acknowledge: () => void;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="text-base font-bold">
        Notification – {notif.event_type.replace(/_/g, " ")}
      </div>

      <HeaderCard notif={notif} />
      <ChangedLineItemsHistory notif={notif} history={history} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <StatusChipBar notif={notif} reads={reads} />
        <div className="flex items-center gap-2">
          {me && !myRead && notif.target_departments.length > 0 && (
            <Select value={ackDept} onValueChange={setAckDept}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue placeholder="Acknowledge as" />
              </SelectTrigger>
              <SelectContent>
                {notif.target_departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {me && !myRead ? (
            <Button
              onClick={acknowledge}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Check className="mr-1 h-4 w-4" /> Acknowledge
            </Button>
          ) : myRead ? (
            <span className="rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <Check className="mr-1 inline h-3.5 w-3.5" /> Acknowledged
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default NotificationDetailDialog;
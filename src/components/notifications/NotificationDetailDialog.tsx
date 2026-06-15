import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(
    null,
  );

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
    setLoading(false);
  }, [notificationId]);

  useEffect(() => {
    if (notificationId) load();
    else {
      setNotif(null);
      setReads([]);
    }
  }, [notificationId, load]);

  async function acknowledge() {
    if (!me || !notif) return;
    const { error } = await supabase.from("app_notification_reads" as never).insert({
      notification_id: notif.id,
      user_id: me.id,
      user_name: me.name,
      department: me.department,
    } as never);
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
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        {loading || !notif ? (
          <div className="py-10 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{notif.title}</DialogTitle>
              <DialogDescription>
                {notif.module.toUpperCase()} · {notif.record_ref || "—"}
                {notif.client_name ? ` · ${notif.client_name}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Changed by</div>
                <div className="font-medium">{notif.actor_user_name || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Department</div>
                <div className="font-medium">{notif.actor_department || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">When</div>
                <div className="font-medium">
                  {new Date(notif.created_at).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Event</div>
                <div className="font-medium capitalize">
                  {notif.event_type.replace(/_/g, " ")}
                </div>
              </div>
            </div>

            {/* Top-level field diff */}
            <div className="mt-2">
              <div className="text-sm font-semibold mb-2">Field changes</div>
              {(() => {
                const fields = changedTopFields(notif);
                if (fields.length === 0)
                  return (
                    <div className="text-xs text-muted-foreground">
                      No top-level field changes.
                    </div>
                  );
                return (
                  <div className="rounded border divide-y">
                    {fields.map((k) => {
                      const a = (notif.old_value || {})[k];
                      const b = (notif.new_value || {})[k];
                      return (
                        <div
                          key={k}
                          className="grid grid-cols-12 gap-2 px-3 py-2 text-xs"
                        >
                          <div className="col-span-3 font-medium">{labelOf(k)}</div>
                          <div className="col-span-4 text-destructive line-through break-words">
                            {truncate(a, 200)}
                          </div>
                          <div className="col-span-1 text-center text-muted-foreground">
                            →
                          </div>
                          <div className="col-span-4 text-primary break-words">
                            {truncate(b, 200)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Line-item diffs */}
            {lineChanges.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-semibold mb-2">
                  Line item changes ({lineChanges.length})
                </div>
                <div className="space-y-2">
                  {lineChanges.map((lc, idx) => (
                    <LineDiffCard key={idx} change={lc} />
                  ))}
                </div>
              </div>
            )}

            {/* Department-wise acknowledgement */}
            <div className="mt-3">
              <DepartmentAckPanel
                targets={notif.target_departments}
                reads={reads}
              />
            </div>

            {me && !myRead && (
              <div className="flex justify-end mt-2">
                <Button onClick={acknowledge}>
                  <Check className="h-4 w-4 mr-1" /> Acknowledge
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LineDiffCard({ change }: { change: LineChange }) {
  const before = change.before || {};
  const after = change.after || {};
  const keys =
    change.kind === "modified"
      ? change.changed_fields
      : Array.from(
          new Set(
            [
              ...Object.keys(before),
              ...Object.keys(after),
            ].filter((k) => !HIDDEN_FIELDS.has(k) && !k.endsWith("_id")),
          ),
        );

  const kindBadge =
    change.kind === "added" ? (
      <Badge>Added</Badge>
    ) : change.kind === "removed" ? (
      <Badge variant="destructive">Removed</Badge>
    ) : (
      <Badge variant="secondary">Modified</Badge>
    );

  return (
    <div className="rounded border">
      <div className="px-3 py-1.5 bg-muted/40 flex items-center gap-2 text-xs">
        <span className="font-medium">Line {change.line_no ?? "—"}</span>
        {kindBadge}
        {change.kind === "modified" && (
          <span className="text-muted-foreground">
            · {change.changed_fields.length} field(s) changed
          </span>
        )}
      </div>
      <div className="divide-y">
        {keys.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">No fields.</div>
        ) : (
          keys.map((k) => {
            const a = (before as Record<string, unknown>)[k];
            const b = (after as Record<string, unknown>)[k];
            return (
              <div
                key={k}
                className="grid grid-cols-12 gap-2 px-3 py-1.5 text-xs"
              >
                <div className="col-span-3 font-medium">{labelOf(k)}</div>
                <div className="col-span-4 text-destructive line-through break-words">
                  {truncate(a, 160)}
                </div>
                <div className="col-span-1 text-center text-muted-foreground">→</div>
                <div className="col-span-4 text-primary break-words">
                  {truncate(b, 160)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DepartmentAckPanel({
  targets,
  reads,
}: {
  targets: string[];
  reads: ReadRow[];
}) {
  const ackByDept = new Map<string, ReadRow[]>();
  for (const r of reads) {
    if (!r.department) continue;
    if (!ackByDept.has(r.department)) ackByDept.set(r.department, []);
    ackByDept.get(r.department)!.push(r);
  }
  const total = targets.length;
  const seen = targets.filter((d) => ackByDept.has(d)).length;
  const pending = Math.max(0, total - seen);

  return (
    <div>
      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
        Department acknowledgement
        <Badge variant="outline">{total} total</Badge>
        <Badge>{seen} seen</Badge>
        {pending > 0 && <Badge variant="destructive">{pending} pending</Badge>}
      </div>
      {total === 0 ? (
        <div className="text-xs text-muted-foreground">
          No target departments configured.
        </div>
      ) : (
        <div className="rounded border divide-y">
          {targets.map((d) => {
            const seenBy = ackByDept.get(d) || [];
            return (
              <div
                key={d}
                className="grid grid-cols-12 gap-2 px-3 py-2 text-xs items-center"
              >
                <div className="col-span-3 font-medium">{d}</div>
                <div className="col-span-2">
                  {seenBy.length === 0 ? (
                    <Badge variant="destructive">Not Seen</Badge>
                  ) : (
                    <Badge>Seen</Badge>
                  )}
                </div>
                <div className="col-span-7 text-muted-foreground">
                  {seenBy.length === 0
                    ? "Waiting for acknowledgement"
                    : seenBy
                        .map(
                          (s) =>
                            `${s.user_name || "User"} · ${new Date(
                              s.seen_at,
                            ).toLocaleString()}`,
                        )
                        .join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationDetailDialog;
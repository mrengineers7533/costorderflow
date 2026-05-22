import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import type { ActivityModule, ActivityStatus } from "@/lib/activity/types";
import { CheckCircle2, AlertTriangle, Clock, Info, Zap } from "lucide-react";

const STATUS_META: Record<ActivityStatus, { label: string; cls: string; Icon: typeof Info }> = {
  info:     { label: "Info",     cls: "bg-muted text-foreground",                Icon: Info },
  pending:  { label: "Pending",  cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",  Icon: Clock },
  warning:  { label: "Warning",  cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400", Icon: AlertTriangle },
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
  impacted: { label: "Impacted", cls: "bg-purple-500/15 text-purple-700 dark:text-purple-400", Icon: Zap },
};

const MODULES: { value: ActivityModule | "all"; label: string }[] = [
  { value: "all", label: "All modules" },
  { value: "oa", label: "Order Acceptance" },
  { value: "boq", label: "BOQ" },
  { value: "design", label: "Design" },
  { value: "requisition", label: "Requisition" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "purchase", label: "Purchase" },
  { value: "pi", label: "PI" },
  { value: "cost_sheet", label: "Cost Sheet" },
];

const STATUSES: { value: ActivityStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "warning", label: "Warning" },
  { value: "impacted", label: "Impacted" },
  { value: "approved", label: "Approved" },
  { value: "info", label: "Info" },
];

export function ActivityPanel({ orderRootId }: { orderRootId?: string }) {
  const { events, readIds, markAllRead, loading } = useActivityFeed({ orderRootId });
  const [module, setModule] = useState<ActivityModule | "all">("all");
  const [status, setStatus] = useState<ActivityStatus | "all">("all");

  const filtered = useMemo(() => events.filter((e) =>
    (module === "all" || e.module === module) && (status === "all" || e.status === status),
  ), [events, module, status]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 border-b flex items-center gap-2">
        <Select value={module} onValueChange={(v) => setModule(v as ActivityModule | "all")}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>{MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as ActivityStatus | "all")}>
          <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="ml-auto h-8 text-xs" onClick={markAllRead}>Mark all read</Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {loading && <div className="p-6 text-sm text-muted-foreground text-center">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">No activity yet.</div>
          )}
          {filtered.map((e) => {
            const meta = STATUS_META[e.status] ?? STATUS_META.info;
            const Icon = meta.Icon;
            const unread = !readIds.has(e.id);
            return (
              <div key={e.id} className={`px-4 py-3 flex gap-3 ${unread ? "bg-accent/30" : ""}`}>
                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{e.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">{e.module}</Badge>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>
                  </div>
                  {e.message && <p className="text-xs text-muted-foreground mt-0.5">{e.message}</p>}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {e.actor_name || e.actor_email || "system"} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
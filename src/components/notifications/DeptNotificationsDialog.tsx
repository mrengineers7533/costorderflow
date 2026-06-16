import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { normalizeDept } from "@/lib/notifications/dept";
import { NotificationDetailDialog } from "./NotificationDetailDialog";

interface NotifRow {
  id: string;
  module: string;
  title: string;
  actor_user_name: string | null;
  actor_department: string | null;
  target_departments: string[];
  created_at: string;
}

interface ReadRow {
  notification_id: string;
  department: string | null;
}

interface Props {
  department: string | null;
  mode: "all" | "seen";
  rows: NotifRow[];
  readsByNotif: Record<string, ReadRow[]>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function DeptNotificationsDialog({
  department,
  mode,
  rows,
  readsByNotif,
  open,
  onOpenChange,
}: Props) {
  const [sort, setSort] = useState<"latest" | "oldest">("latest");
  const [status, setStatus] = useState<"all" | "seen" | "unseen">(
    mode === "seen" ? "seen" : "all",
  );
  const [detailId, setDetailId] = useState<string | null>(null);

  const deptKey = normalizeDept(department);

  const seenForDept = (id: string) =>
    (readsByNotif[id] || []).some(
      (r) => normalizeDept(r.department) === deptKey,
    );

  const list = useMemo(() => {
    if (!deptKey) return [];
    const base = rows.filter((r) =>
      r.target_departments.some((d) => normalizeDept(d) === deptKey),
    );
    const filtered = base.filter((r) => {
      const seen = seenForDept(r.id);
      if (status === "seen") return seen;
      if (status === "unseen") return !seen;
      return true;
    });
    filtered.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sort === "latest" ? db - da : da - db;
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, readsByNotif, deptKey, status, sort]);

  const lockStatus = mode === "seen";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {department} —{" "}
              {mode === "seen" ? "Seen Notifications" : "Total Notifications"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 pb-2">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Sort:</span>
              <Select value={sort} onValueChange={(v) => setSort(v as "latest" | "oldest")}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">Status:</span>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "all" | "seen" | "unseen")}
                disabled={lockStatus}
              >
                <SelectTrigger className="h-8 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="seen">Seen</SelectItem>
                  <SelectItem value="unseen">Unseen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {list.length} notification{list.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Module</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[180px]">Actor</TableHead>
                  <TableHead className="w-[160px]">Date</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No notifications.
                    </TableCell>
                  </TableRow>
                ) : (
                  list.map((n) => {
                    const seen = seenForDept(n.id);
                    return (
                      <TableRow
                        key={n.id}
                        className="cursor-pointer"
                        onClick={() => setDetailId(n.id)}
                      >
                        <TableCell>
                          <Badge variant="outline" className="uppercase text-[10px]">
                            {n.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{n.title}</TableCell>
                        <TableCell className="text-xs">
                          {n.actor_user_name || "—"}
                          {n.actor_department ? (
                            <span className="text-muted-foreground"> ({n.actor_department})</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {seen ? (
                            <Badge className="text-[10px]">Seen</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Unseen
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <NotificationDetailDialog
        notificationId={detailId}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
      />
    </>
  );
}

export default DeptNotificationsDialog;
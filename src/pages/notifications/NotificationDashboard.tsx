import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Eye, Search, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
}

interface ReadRow {
  notification_id: string;
  user_id: string;
  user_name: string | null;
  department: string | null;
  seen_at: string;
}

export default function NotificationDashboard() {
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [me, setMe] = useState<{ id: string; name: string; department: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "new" | "ack">("all");
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    setRows(((n || []) as unknown as NotifRow[]));

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

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
      if (tab === "new" && myReadIds.has(r.id)) return false;
      if (tab === "ack" && !myReadIds.has(r.id)) return false;
      if (term) {
        const hay = [r.title, r.summary, r.record_ref, r.client_name, r.actor_user_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, moduleFilter, tab, myReadIds, q]);

  async function acknowledge(n: NotifRow) {
    if (!me) return;
    const { error } = await supabase.from("app_notification_reads" as never).insert({
      notification_id: n.id,
      user_id: me.id,
      user_name: me.name,
      department: me.department,
    } as never);
    if (error) {
      toast({ title: "Could not acknowledge", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Acknowledged" });
    await load();
  }

  function renderDiff(n: NotifRow) {
    if (!n.old_value && !n.new_value) return null;
    const keys = new Set<string>([
      ...Object.keys(n.old_value || {}),
      ...Object.keys(n.new_value || {}),
    ]);
    return (
      <div className="text-xs space-y-0.5 mt-1">
        {Array.from(keys).map((k) => (
          <div key={k}>
            <span className="text-muted-foreground">{k}:</span>{" "}
            <span className="line-through text-destructive">
              {String((n.old_value || {})[k] ?? "—")}
            </span>{" "}
            →{" "}
            <span className="text-primary">
              {String((n.new_value || {})[k] ?? "—")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notification Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Cross-department change feed. Acknowledge items to mark them as seen.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="new">New</TabsTrigger>
            <TabsTrigger value="ack">Acknowledged</TabsTrigger>
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
                  <TableHead>Title</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((n) => {
                  const seen = myReadIds.has(n.id);
                  const mine = me && n.actor_user_id === me.id;
                  const ack = readsByNotif[n.id] || [];
                  const isOpen = !!expanded[n.id];
                  return (
                    <>
                      <TableRow key={n.id}>
                        <TableCell className="max-w-[360px]">
                          <div className="font-medium">{n.title}</div>
                          {n.summary && <div className="text-xs text-muted-foreground">{n.summary}</div>}
                          {renderDiff(n)}
                        </TableCell>
                        <TableCell><Badge variant="outline">{n.module}</Badge></TableCell>
                        <TableCell className="text-xs">{n.record_ref || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {n.actor_user_name || "—"}
                          {n.actor_department && (
                            <div className="text-muted-foreground">{n.actor_department}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {seen ? (
                            <Badge>Seen</Badge>
                          ) : (
                            <Badge variant="destructive">New</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {!seen && (
                              <Button size="sm" onClick={() => acknowledge(n)}>
                                <Check className="h-4 w-4 mr-1" /> Acknowledge
                              </Button>
                            )}
                            {mine && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExpanded((e) => ({ ...e, [n.id]: !e[n.id] }))}
                              >
                                <Eye className="h-4 w-4 mr-1" /> Tracking
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {mine && isOpen && (
                        <TableRow key={`${n.id}-track`}>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <div className="p-2 space-y-2">
                              <div className="text-xs font-medium">Department acknowledgement</div>
                              <div className="flex flex-wrap gap-2">
                                {n.target_departments.length === 0 && (
                                  <span className="text-xs text-muted-foreground">No target departments configured.</span>
                                )}
                                {n.target_departments.map((d) => {
                                  const seenBy = ack.filter((r) => r.department === d);
                                  return (
                                    <div key={d} className="border rounded px-2 py-1 text-xs">
                                      <div className="font-medium">{d}</div>
                                      {seenBy.length === 0 ? (
                                        <div className="text-muted-foreground">Pending</div>
                                      ) : (
                                        seenBy.map((s) => (
                                          <div key={s.user_id} className="text-muted-foreground">
                                            {s.user_name || s.user_id} ·{" "}
                                            {new Date(s.seen_at).toLocaleString()}
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/access/modules";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";

type Profile = { id: string; full_name: string | null; email: string | null; is_active: boolean };
type Perm = "view" | "edit";

export default function AdminAccess() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Map<string, Map<string, Perm>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  async function refresh() {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, is_active"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_access").select("user_id, module, permission"),
    ]);
    setProfiles((profs as Profile[]) ?? []);
    const ad = new Set<string>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      if (r.role === "admin") ad.add(r.user_id);
    });
    setAdminIds(ad);
    const m = new Map<string, Map<string, Perm>>();
    ((rows ?? []) as { user_id: string; module: string; permission?: Perm | null }[]).forEach((r) => {
      if (!m.has(r.user_id)) m.set(r.user_id, new Map());
      m.get(r.user_id)!.set(r.module, (r.permission as Perm) ?? "edit");
    });
    setAccess(m);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = profiles.slice().sort((a, b) =>
      (a.email ?? "").localeCompare(b.email ?? ""),
    );
    if (!q) return list;
    return list.filter(
      (p) => (p.email ?? "").toLowerCase().includes(q) || (p.full_name ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  async function setPerm(userId: string, mod: ModuleKey, next: Perm | null) {
    const key = `${userId}:${mod}`;
    setBusy(key);
    try {
      if (next === null) {
        const { error } = await supabase
          .from("user_module_access")
          .delete()
          .eq("user_id", userId)
          .eq("module", mod);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from("user_module_access")
          .upsert(
            { user_id: userId, module: mod, permission: next } as any,
            { onConflict: "user_id,module" },
          );
        if (error) throw error;
      }
      setAccess((prev) => {
        const out = new Map(prev);
        const mm = new Map(out.get(userId) ?? new Map<string, Perm>());
        if (next === null) mm.delete(mod); else mm.set(mod, next);
        out.set(userId, mm as Map<string, Perm>);
        return out;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(userId: string, isActive: boolean) {
    if (userId === currentUserId && !isActive) {
      toast.error("You cannot disable your own account");
      return;
    }
    const key = `active:${userId}`;
    setBusy(key);
    try {
      const { data, error } = await supabase.functions.invoke("admin-set-user-active", {
        body: { user_id: userId, is_active: isActive },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setProfiles((prev) => prev.map((p) => p.id === userId ? { ...p, is_active: isActive } : p));
      toast.success(isActive ? "User enabled" : "User disabled");
    } catch (e) {
      toast.error((e as Error).message || "Failed to update status");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <AdminTabs title="User Access Control" description="Assign per-module access to each user. Admins have full access automatically." />
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => setShowCreate(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Add User
            </Button>
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[240px]">User</TableHead>
                  <TableHead className="text-center whitespace-nowrap">Active</TableHead>
                  {MODULES.map((m) => (
                    <TableHead key={m.key} className="text-center whitespace-nowrap">
                      <div>{m.label}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">View / Edit</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={MODULES.length + 2} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={MODULES.length + 2} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                ) : filtered.map((p) => {
                  const isAdmin = adminIds.has(p.id);
                  const userMods = access.get(p.id) ?? new Map<string, Perm>();
                  const activeKey = `active:${p.id}`;
                  return (
                    <TableRow key={p.id} className={!p.is_active ? "opacity-60" : undefined}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{p.full_name || "—"}</span>
                          <span className="text-xs text-muted-foreground">{p.email}</span>
                          {isAdmin && <Badge variant="secondary" className="mt-1 w-fit">Full access (Admin)</Badge>}
                          {!p.is_active && <Badge variant="outline" className="mt-1 w-fit">Disabled</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={p.is_active}
                          disabled={busy === activeKey || p.id === currentUserId}
                          onCheckedChange={(v) => toggleActive(p.id, v === true)}
                        />
                      </TableCell>
                      {MODULES.map((m) => {
                        const perm = userMods.get(m.key) ?? null;
                        const hasView = isAdmin || perm !== null;
                        const hasEdit = isAdmin || perm === "edit";
                        const key = `${p.id}:${m.key}`;
                        const disabled = isAdmin || busy === key || !p.is_active;
                        return (
                          <TableCell key={m.key} className="text-center">
                            <div className="flex items-center justify-center gap-3">
                              <Checkbox
                                checked={hasView}
                                disabled={disabled}
                                onCheckedChange={(v) => {
                                  if (v === true) { if (!hasView) setPerm(p.id, m.key, "view"); }
                                  else { setPerm(p.id, m.key, null); }
                                }}
                                aria-label="View"
                              />
                              <Checkbox
                                checked={hasEdit}
                                disabled={disabled}
                                onCheckedChange={(v) => {
                                  setPerm(p.id, m.key, v === true ? "edit" : (hasView ? "view" : null));
                                }}
                                aria-label="Edit"
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={refresh}
      />
    </div>
  );
}
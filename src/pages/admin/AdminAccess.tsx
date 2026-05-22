import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { MODULES, type ModuleKey } from "@/lib/access/modules";

type Profile = { id: string; full_name: string | null; email: string | null };

export default function AdminAccess() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: rows }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_access").select("user_id, module"),
    ]);
    setProfiles((profs as Profile[]) ?? []);
    const ad = new Set<string>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      if (r.role === "admin") ad.add(r.user_id);
    });
    setAdminIds(ad);
    const m = new Map<string, Set<string>>();
    ((rows ?? []) as { user_id: string; module: string }[]).forEach((r) => {
      if (!m.has(r.user_id)) m.set(r.user_id, new Set());
      m.get(r.user_id)!.add(r.module);
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

  async function toggle(userId: string, mod: ModuleKey, on: boolean) {
    const key = `${userId}:${mod}`;
    setBusy(key);
    try {
      if (on) {
        const { error } = await supabase
          .from("user_module_access")
          .insert({ user_id: userId, module: mod });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_module_access")
          .delete()
          .eq("user_id", userId)
          .eq("module", mod);
        if (error) throw error;
      }
      // Optimistic local update
      setAccess((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(userId) ?? []);
        if (on) set.add(mod); else set.delete(mod);
        next.set(userId, set);
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <AdminTabs title="User Access Control" description="Assign per-module access to each user. Admins have full access automatically." />
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[240px]">User</TableHead>
                  {MODULES.map((m) => (
                    <TableHead key={m.key} className="text-center whitespace-nowrap">{m.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={MODULES.length + 1} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={MODULES.length + 1} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                ) : filtered.map((p) => {
                  const isAdmin = adminIds.has(p.id);
                  const userMods = access.get(p.id) ?? new Set();
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{p.full_name || "—"}</span>
                          <span className="text-xs text-muted-foreground">{p.email}</span>
                          {isAdmin && <Badge variant="secondary" className="mt-1 w-fit">Full access (Admin)</Badge>}
                        </div>
                      </TableCell>
                      {MODULES.map((m) => {
                        const checked = isAdmin || userMods.has(m.key);
                        const key = `${p.id}:${m.key}`;
                        return (
                          <TableCell key={m.key} className="text-center">
                            <Checkbox
                              checked={checked}
                              disabled={isAdmin || busy === key}
                              onCheckedChange={(v) => toggle(p.id, m.key, v === true)}
                            />
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
    </div>
  );
}
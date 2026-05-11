import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { KeyRound, Pencil, Search, Trash2 } from "lucide-react";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};
type Role = "admin" | "user";

type Row = Profile & { role: Role; domain: string };

function domainOf(email: string | null) {
  if (!email) return "—";
  const parts = email.split("@");
  return parts[1]?.toLowerCase() ?? "—";
}

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Row | null>(null);
  const [resetting, setResetting] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  async function refresh() {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: domains }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, is_active, created_at"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("allowed_domains").select("domain"),
    ]);
    const roleMap = new Map<string, Role>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      if (r.role === "admin") roleMap.set(r.user_id, "admin");
      else if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, "user");
    });
    const list: Row[] = ((profiles as Profile[]) ?? []).map((p) => ({
      ...p,
      role: roleMap.get(p.id) ?? "user",
      domain: domainOf(p.email),
    }));
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    setRows(list);
    setAllowedDomains((domains ?? []).map((d: { domain: string }) => d.domain.toLowerCase()));
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (!q) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, domainFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <AdminTabs title="Users" description="Manage user accounts, roles and access" />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Filter by domain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {allowedDomains.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Full name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            ) : filtered.map((r) => {
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>
                    <span className="text-sm">{r.domain}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.role === "admin" ? "default" : "secondary"}>
                      {r.role === "admin" ? "Admin" : "User"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "outline"} className={r.is_active ? "bg-emerald-500 hover:bg-emerald-500/90" : ""}>
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetting(r)}>
                        <KeyRound className="h-4 w-4 mr-1" /> Reset
                      </Button>
                      {r.id !== currentUserId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <EditUserDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          row={resetting}
          onClose={() => setResetting(null)}
        />
      )}
      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                Permanently delete <strong>{deleting.email}</strong>? This removes their
                login, profile, and all role access. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteBusy}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (e) => {
                  e.preventDefault();
                  if (!deleting) return;
                  setDeleteBusy(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
                      body: { user_id: deleting.id },
                    });
                    if (error) throw error;
                    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
                    toast.success("User deleted");
                    setDeleting(null);
                    refresh();
                  } catch (err) {
                    toast.error((err as Error).message || "Failed to delete user");
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function EditUserDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(row.full_name ?? "");
  const [role, setRole] = useState<Role>(row.role);
  const [active, setActive] = useState(row.is_active);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, is_active: active })
        .eq("id", row.id);
      if (pErr) throw pErr;

      if (role !== row.role) {
        // Replace role rows with the new one
        await supabase.from("user_roles").delete().eq("user_id", row.id);
        const { error: rErr } = await supabase
          .from("user_roles")
          .insert({ user_id: row.id, role });
        if (rErr) throw rErr;
      }
      toast.success("User updated");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{row.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fn">Full name</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Inactive users cannot use the app.</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function setNewPassword() {
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { user_id: row.id, new_password: pw },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Password updated");
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  async function sendResetEmail() {
    if (!row.email) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(row.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${row.email}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>For {row.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="pw">New password</Label>
            <Input
              id="pw"
              type="text"
              placeholder="Min 8 characters"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <Button className="w-full" onClick={setNewPassword} disabled={busy}>
              {busy ? "Updating…" : "Set new password"}
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>
          <Button variant="outline" className="w-full" onClick={sendResetEmail} disabled={busy}>
            Send password reset email
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
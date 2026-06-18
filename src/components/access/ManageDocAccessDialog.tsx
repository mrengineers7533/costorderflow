import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { DOC_KIND_LABEL, type DocKind, type DocPerm } from "@/lib/access/docAccess";

type Profile = { id: string; full_name: string | null; email: string | null };
type Row = { id: string; user_id: string; permission: DocPerm };

export function ManageDocAccessDialog({
  open, onOpenChange, kind, docId, docLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: DocKind;
  docId: string;
  docLabel?: string;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickUser, setPickUser] = useState<string>("");
  const [pickPerm, setPickPerm] = useState<DocPerm>("view");
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [{ data: profs }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("is_active", true),
      supabase
        .from("document_access")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, user_id, permission" as any)
        .eq("doc_kind", kind)
        .eq("doc_id", docId),
    ]);
    setProfiles((profs as Profile[]) ?? []);
    setRows(((r ?? []) as unknown) as Row[]);
    setLoading(false);
  }

  useEffect(() => { if (open && docId) refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, docId, kind]);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const assignedIds = useMemo(() => new Set(rows.map((r) => r.user_id)), [rows]);
  const available = useMemo(
    () => profiles
      .filter((p) => !assignedIds.has(p.id))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")),
    [profiles, assignedIds],
  );

  async function add() {
    if (!pickUser) return;
    setBusy("add");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("document_access").insert({
        doc_kind: kind, doc_id: docId, user_id: pickUser, permission: pickPerm,
      } as any);
      if (error) throw error;
      setPickUser("");
      setPickPerm("view");
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function changePerm(id: string, perm: DocPerm) {
    setBusy(id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("document_access").update({ permission: perm } as any).eq("id", id);
      if (error) throw error;
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const { error } = await supabase.from("document_access").delete().eq("id", id);
      if (error) throw error;
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Access — {DOC_KIND_LABEL[kind]}</DialogTitle>
          <DialogDescription>
            {docLabel ? <span className="font-mono">{docLabel}</span> : "Choose which users can view or edit this document. Admins always have full access."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Add user</label>
              <Select value={pickUser} onValueChange={setPickUser}>
                <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground">Permission</label>
              <Select value={pickPerm} onValueChange={(v) => setPickPerm(v as DocPerm)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View only</SelectItem>
                  <SelectItem value="edit">View &amp; Edit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={add} disabled={!pickUser || busy === "add"}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <div className="rounded-lg border divide-y">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No users assigned. Only the creator and admins can access this.</div>
            ) : rows.map((r) => {
              const p = byId.get(r.user_id);
              return (
                <div key={r.id} className="flex items-center gap-2 p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p?.full_name || p?.email || r.user_id}</div>
                    {p?.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
                  </div>
                  <Badge variant={r.permission === "edit" ? "default" : "secondary"}>
                    {r.permission === "edit" ? "Edit" : "View"}
                  </Badge>
                  <Select value={r.permission} onValueChange={(v) => changePerm(r.id, v as DocPerm)} disabled={busy === r.id}>
                    <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} disabled={busy === r.id}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
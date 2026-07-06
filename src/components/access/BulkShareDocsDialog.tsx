import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { DOC_KIND_LABEL, type DocKind, type DocPerm } from "@/lib/access/docAccess";

type Profile = { id: string; full_name: string | null; email: string | null };

export function BulkShareDocsDialog({
  open,
  onOpenChange,
  kind,
  docIds,
  mode,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: DocKind;
  docIds: string[];
  mode: "share" | "revoke";
  onDone?: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [perm, setPerm] = useState<DocPerm>("view");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPicked(new Set());
    setPerm("view");
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .then(({ data }) => {
        const list = ((data as Profile[]) ?? []).sort((a, b) =>
          (a.email ?? "").localeCompare(b.email ?? ""),
        );
        setProfiles(list);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.full_name ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (!picked.size || !docIds.length) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      if (mode === "share") {
        // Upsert each (doc, user) pair. Fetch existing rows first, then
        // update those and insert the rest.
        const userIds = Array.from(picked);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await supabase
          .from("document_access")
          .select("id, doc_id, user_id" as any)
          .eq("doc_kind", kind)
          .in("doc_id", docIds)
          .in("user_id", userIds);
        const seen = new Map<string, string>(); // `${doc}|${user}` -> row id
        ((existing as unknown as Array<{ id: string; doc_id: string; user_id: string }>) ?? [])
          .forEach((r) => seen.set(`${r.doc_id}|${r.user_id}`, r.id));

        const toInsert: Array<{ doc_kind: DocKind; doc_id: string; user_id: string; permission: DocPerm }> = [];
        const toUpdate: string[] = [];
        for (const d of docIds) {
          for (const u of userIds) {
            const key = `${d}|${u}`;
            if (seen.has(key)) toUpdate.push(seen.get(key)!);
            else toInsert.push({ doc_kind: kind, doc_id: d, user_id: u, permission: perm });
          }
        }
        if (toUpdate.length) {
          const { error } = await supabase
            .from("document_access")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ permission: perm } as any)
            .in("id", toUpdate);
          if (error) throw error;
        }
        if (toInsert.length) {
          const { error } = await supabase
            .from("document_access")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert(toInsert as any);
          if (error) throw error;
        }
        toast.success(
          `Shared ${docIds.length} document(s) with ${userIds.length} user(s)`,
        );
      } else {
        const userIds = Array.from(picked);
        const { error } = await supabase
          .from("document_access")
          .delete()
          .eq("doc_kind", kind)
          .in("doc_id", docIds)
          .in("user_id", userIds);
        if (error) throw error;
        toast.success(
          `Revoked access for ${userIds.length} user(s) on ${docIds.length} document(s)`,
        );
      }
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "share" ? "Share" : "Revoke access on"}{" "}
            {docIds.length} {DOC_KIND_LABEL[kind]}
            {docIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {mode === "share"
              ? "Select the users who should be able to see or edit the selected documents."
              : "Remove the selected users from every selected document. This does not affect the creator or admins."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "share" && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Permission</span>
              <Select value={perm} onValueChange={(v) => setPerm(v as DocPerm)}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View only</SelectItem>
                  <SelectItem value="edit">View & Edit</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">
                <Badge variant="secondary">{picked.size}</Badge> selected
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border divide-y">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No users found.</div>
            ) : (
              filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/40"
                >
                  <Checkbox
                    checked={picked.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {p.full_name || p.email}
                    </div>
                    {p.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {p.email}
                      </div>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={apply}
            disabled={busy || picked.size === 0}
            variant={mode === "revoke" ? "destructive" : "default"}
          >
            {busy
              ? "Working…"
              : mode === "share"
                ? `Share with ${picked.size}`
                : `Revoke from ${picked.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { DOC_KIND_LABEL, type DocKind, type DocPerm } from "@/lib/access/docAccess";

type DocRow = { id: string; label: string; sub: string };

const KINDS: DocKind[] = ["order", "boq", "pi", "purchase_order", "requisition"];

async function loadDocs(kind: DocKind): Promise<DocRow[]> {
  if (kind === "order") {
    const { data } = await supabase
      .from("orders")
      .select("id, oa_number, company_name, revision")
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((d) => ({
      id: d.id,
      label: `${d.oa_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`,
      sub: d.company_name ?? "",
    }));
  }
  if (kind === "boq") {
    const { data } = await supabase
      .from("boqs")
      .select("id, boq_number, client_name, revision")
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((d) => ({
      id: d.id,
      label: `${d.boq_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`,
      sub: d.client_name ?? "",
    }));
  }
  if (kind === "pi") {
    const { data } = await supabase
      .from("proforma_invoices")
      .select("id, pi_number, company_name, revision")
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((d) => ({
      id: d.id,
      label: `${d.pi_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`,
      sub: d.company_name ?? "",
    }));
  }
  if (kind === "purchase_order") {
    const { data } = await supabase
      .from("purchase_orders")
      .select("id, po_number, vendor_name")
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []).map((d) => ({
      id: d.id,
      label: d.po_number ?? "—",
      sub: d.vendor_name ?? "",
    }));
  }
  // requisition
  const { data } = await supabase
    .from("requisitions")
    .select("id, requisition_number, title")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((d) => ({
    id: d.id,
    label: d.requisition_number ?? "—",
    sub: d.title ?? "",
  }));
}

export function UserDocAccessDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userLabel: string;
}) {
  const [kind, setKind] = useState<DocKind>("order");
  const [docs, setDocs] = useState<Record<DocKind, DocRow[]>>({
    order: [], boq: [], pi: [], purchase_order: [], requisition: [],
  });
  const [loaded, setLoaded] = useState<Record<DocKind, boolean>>({
    order: false, boq: false, pi: false, purchase_order: false, requisition: false,
  });
  const [assigned, setAssigned] = useState<
    Record<DocKind, Map<string, DocPerm>>
  >({
    order: new Map(), boq: new Map(), pi: new Map(),
    purchase_order: new Map(), requisition: new Map(),
  });
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Map<string, DocPerm | "remove">>(
    new Map(),
  );
  const [busy, setBusy] = useState(false);

  // Load all assignments for this user once
  useEffect(() => {
    if (!open) return;
    setPending(new Map());
    setSearch("");
    supabase
      .from("document_access")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("doc_kind, doc_id, permission" as any)
      .eq("user_id", userId)
      .then(({ data }) => {
        const next = {
          order: new Map<string, DocPerm>(),
          boq: new Map<string, DocPerm>(),
          pi: new Map<string, DocPerm>(),
          purchase_order: new Map<string, DocPerm>(),
          requisition: new Map<string, DocPerm>(),
        };
        ((data as unknown as Array<{ doc_kind: DocKind; doc_id: string; permission: DocPerm }>) ?? [])
          .forEach((r) => {
            if (next[r.doc_kind]) next[r.doc_kind].set(r.doc_id, r.permission);
          });
        setAssigned(next);
      });
  }, [open, userId]);

  // Lazy-load docs on tab open
  useEffect(() => {
    if (!open || loaded[kind]) return;
    loadDocs(kind).then((list) => {
      setDocs((prev) => ({ ...prev, [kind]: list }));
      setLoaded((prev) => ({ ...prev, [kind]: true }));
    });
  }, [open, kind, loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = docs[kind];
    if (!q) return list;
    return list.filter(
      (d) =>
        d.label.toLowerCase().includes(q) || d.sub.toLowerCase().includes(q),
    );
  }, [docs, kind, search]);

  function effectivePerm(docId: string): DocPerm | null {
    const key = `${kind}|${docId}`;
    if (pending.has(key)) {
      const p = pending.get(key)!;
      return p === "remove" ? null : p;
    }
    return assigned[kind].get(docId) ?? null;
  }

  function setEffective(docId: string, perm: DocPerm | null) {
    const key = `${kind}|${docId}`;
    const current = assigned[kind].get(docId) ?? null;
    setPending((prev) => {
      const next = new Map(prev);
      if (perm === current) next.delete(key);
      else if (perm === null) next.set(key, "remove");
      else next.set(key, perm);
      return next;
    });
  }

  async function save() {
    if (!pending.size) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const inserts: Array<{ doc_kind: DocKind; doc_id: string; user_id: string; permission: DocPerm }> = [];
      const updates: Array<{ doc_kind: DocKind; doc_id: string; permission: DocPerm }> = [];
      const deletes: Array<{ doc_kind: DocKind; doc_id: string }> = [];
      for (const [key, val] of pending.entries()) {
        const [k, docId] = key.split("|") as [DocKind, string];
        const cur = assigned[k].get(docId) ?? null;
        if (val === "remove") {
          if (cur) deletes.push({ doc_kind: k, doc_id: docId });
        } else if (cur) {
          updates.push({ doc_kind: k, doc_id: docId, permission: val });
        } else {
          inserts.push({ doc_kind: k, doc_id: docId, user_id: userId, permission: val });
        }
      }
      if (inserts.length) {
        const { error } = await supabase
          .from("document_access")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(inserts as any);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase
          .from("document_access")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ permission: u.permission } as any)
          .eq("doc_kind", u.doc_kind)
          .eq("doc_id", u.doc_id)
          .eq("user_id", userId);
        if (error) throw error;
      }
      for (const d of deletes) {
        const { error } = await supabase
          .from("document_access")
          .delete()
          .eq("doc_kind", d.doc_kind)
          .eq("doc_id", d.doc_id)
          .eq("user_id", userId);
        if (error) throw error;
      }
      toast.success("Access updated");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = pending.size;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Grant document access</DialogTitle>
          <DialogDescription>
            Choose which documents <span className="font-medium">{userLabel}</span> can view or edit.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => setKind(v as DocKind)}>
          <TabsList className="grid grid-cols-5 w-full">
            {KINDS.map((k) => (
              <TabsTrigger key={k} value={k} className="text-xs">
                {DOC_KIND_LABEL[k]}
                {assigned[k].size ? (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
                    {assigned[k].size}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {KINDS.map((k) => (
            <TabsContent key={k} value={k} className="space-y-3 mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={`Search ${DOC_KIND_LABEL[k]}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border divide-y">
                {!loaded[k] ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No {DOC_KIND_LABEL[k]}s found.
                  </div>
                ) : (
                  filtered.map((d) => {
                    const eff = effectivePerm(d.id);
                    const checked = eff !== null;
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setEffective(d.id, v ? (eff ?? "view") : null)
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-mono truncate">{d.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {d.sub}
                          </div>
                        </div>
                        <Select
                          value={eff ?? "view"}
                          onValueChange={(v) =>
                            setEffective(d.id, v as DocPerm)
                          }
                          disabled={!checked}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="view">View</SelectItem>
                            <SelectItem value="edit">Edit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="items-center">
          {pendingCount > 0 && (
            <span className="text-xs text-muted-foreground mr-auto">
              {pendingCount} pending change{pendingCount === 1 ? "" : "s"}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || pendingCount === 0}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
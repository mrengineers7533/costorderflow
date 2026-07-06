import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Search, Share2, UserMinus } from "lucide-react";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/access/docAccess";
import { ManageDocAccessDialog } from "@/components/access/ManageDocAccessDialog";
import { BulkShareDocsDialog } from "@/components/access/BulkShareDocsDialog";

type Row = { kind: DocKind; id: string; label: string; sub: string; assigned: number };

const KINDS: DocKind[] = ["order", "boq", "pi", "purchase_order", "requisition"];

export default function AdminDocumentAccess() {
  const [kind, setKind] = useState<DocKind>("order");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<null | "share" | "revoke">(null);

  async function load() {
    setLoading(true);
    let docs: Row[] = [];
    if (kind === "order") {
      const { data } = await supabase.from("orders").select("id, oa_number, company_name, revision").order("created_at", { ascending: false }).limit(500);
      docs = (data ?? []).map((d) => ({ kind, id: d.id, label: `${d.oa_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`, sub: d.company_name ?? "", assigned: 0 }));
    } else if (kind === "boq") {
      const { data } = await supabase.from("boqs").select("id, boq_number, client_name, revision").order("created_at", { ascending: false }).limit(500);
      docs = (data ?? []).map((d) => ({ kind, id: d.id, label: `${d.boq_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`, sub: d.client_name ?? "", assigned: 0 }));
    } else if (kind === "pi") {
      const { data } = await supabase.from("proforma_invoices").select("id, pi_number, company_name, revision").order("created_at", { ascending: false }).limit(500);
      docs = (data ?? []).map((d) => ({ kind, id: d.id, label: `${d.pi_number ?? "—"}${d.revision ? ` R${d.revision}` : ""}`, sub: d.company_name ?? "", assigned: 0 }));
    } else if (kind === "purchase_order") {
      const { data } = await supabase.from("purchase_orders").select("id, po_number, vendor_name").order("created_at", { ascending: false }).limit(500);
      docs = (data ?? []).map((d) => ({ kind, id: d.id, label: d.po_number ?? "—", sub: d.vendor_name ?? "", assigned: 0 }));
    } else if (kind === "requisition") {
      const { data } = await supabase.from("requisitions").select("id, requisition_number, title").order("created_at", { ascending: false }).limit(500);
      docs = (data ?? []).map((d) => ({ kind, id: d.id, label: d.requisition_number ?? "—", sub: d.title ?? "", assigned: 0 }));
    }

    // Count assigned users per doc
    const ids = docs.map((d) => d.id);
    if (ids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: acc } = await supabase.from("document_access").select("doc_id" as any).eq("doc_kind", kind).in("doc_id", ids);
      const c = new Map<string, number>();
      (((acc ?? []) as unknown) as { doc_id: string }[]).forEach((r) => c.set(r.doc_id, (c.get(r.doc_id) ?? 0) + 1));
      setCounts(c);
    } else {
      setCounts(new Map());
    }
    setRows(docs);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  // Reset selection whenever the doc kind changes.
  useEffect(() => { setSelected(new Set()); }, [kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q));
  }, [rows, search]);

  const allOnPageChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someOnPageChecked = filtered.some((r) => selected.has(r.id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageChecked) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <AdminTabs title="Document Access" description="Assign per-document view/edit access. Admins always have full access. Creators automatically get edit access on the documents they create." />
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex gap-3 items-center flex-wrap">
            <Select value={kind} onValueChange={(v) => setKind(v as DocKind)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{DOC_KIND_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative max-w-sm flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by number or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {selected.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  <Badge variant="secondary">{selected.size}</Badge> selected
                </span>
              )}
              <Button
                size="sm"
                variant="default"
                disabled={selected.size === 0}
                onClick={() => setBulk("share")}
              >
                <Share2 className="h-4 w-4 mr-1" /> Share selected…
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selected.size === 0}
                onClick={() => setBulk("revoke")}
              >
                <UserMinus className="h-4 w-4 mr-1" /> Revoke selected…
              </Button>
            </div>
          </div>

          <div className="overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageChecked ? true : someOnPageChecked ? "indeterminate" : false}
                      onCheckedChange={togglePage}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-center">Assigned Users</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No documents found</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleOne(r.id)}
                        aria-label={`Select ${r.label}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.sub}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{counts.get(r.id) ?? 0}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                        <Users className="h-4 w-4 mr-1" /> Manage Access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {open && (
        <ManageDocAccessDialog
          open={!!open}
          onOpenChange={(v) => { if (!v) { setOpen(null); load(); } }}
          kind={open.kind}
          docId={open.id}
          docLabel={open.label}
        />
      )}

      {bulk && (
        <BulkShareDocsDialog
          open={!!bulk}
          onOpenChange={(v) => { if (!v) setBulk(null); }}
          kind={kind}
          docIds={Array.from(selected)}
          mode={bulk}
          onDone={() => { setSelected(new Set()); load(); }}
        />
      )}
    </div>
  );
}
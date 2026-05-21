import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { History } from "lucide-react";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";

type FK = "item_no" | "model_number" | "description" | "quantity" | "unit" | "remarks";
const FIELDS: { key: FK; label: string }[] = [
  { key: "item_no", label: "Item No" },
  { key: "model_number", label: "Model Number" },
  { key: "description", label: "Description" },
  { key: "quantity", label: "Qty" },
  { key: "unit", label: "Unit" },
  { key: "remarks", label: "Remarks" },
];

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}
function eq(a: unknown, b: unknown): boolean {
  const na = a == null || a === "" ? null : a;
  const nb = b == null || b === "" ? null : b;
  if (typeof na === "number" || typeof nb === "number")
    return Number(na || 0) === Number(nb || 0);
  return String(na ?? "") === String(nb ?? "");
}
function keyOf(it: BoqLineItem): string {
  return ((it.model_number || "").trim().toLowerCase() + "|" +
    (it.description || "").trim().toLowerCase()) || (it.id || "");
}

interface Props {
  orderId: string | null;
  item: BoqLineItem;
}

export function BoqItemChangeHistoryButton({ orderId, item }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BoqRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const itemKey = keyOf(item);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("boqs")
          .select("*")
          .eq("order_id", orderId);
        const list = ((data as unknown as BoqRecord[]) || []).slice()
          .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);

  const snapshots = useMemo(() => rows.map((r) => {
    const items = (r.line_items || []) as BoqLineItem[];
    const match = items.find((it) => keyOf(it) === itemKey);
    return { rev: r.revision ?? 0, rec: r, item: match };
  }), [rows, itemKey]);

  const events = useMemo(() => {
    const out: {
      rev: number; prevRev: number; when: string;
      kind: "baseline" | "added" | "removed" | "modified" | "unchanged";
      changes: { field: FK; label: string; oldV: unknown; newV: unknown }[];
      snapshot?: { field: FK; label: string; value: unknown }[];
    }[] = [];
    for (let i = 0; i < snapshots.length; i++) {
      const curr = snapshots[i];
      const prev = i > 0 ? snapshots[i - 1] : null;
      const when = new Date(curr.rec.boq_date || curr.rec.created_at).toLocaleString("en-IN");
      if (!curr.item && prev?.item) {
        out.push({ rev: curr.rev, prevRev: prev.rev, when, kind: "removed", changes: [] });
        continue;
      }
      if (curr.item && !prev?.item) {
        const snapshot = FIELDS.map((f) => ({
          field: f.key, label: f.label,
          value: (curr.item as unknown as Record<string, unknown>)[f.key],
        })).filter((c) => c.value != null && c.value !== "");
        out.push({
          rev: curr.rev, prevRev: prev?.rev ?? -1, when,
          kind: i === 0 ? "baseline" : "added",
          changes: snapshot.map((s) => ({ field: s.field, label: s.label, oldV: undefined, newV: s.value })),
          snapshot,
        });
        continue;
      }
      if (curr.item && prev?.item) {
        const changes: { field: FK; label: string; oldV: unknown; newV: unknown }[] = [];
        for (const f of FIELDS) {
          const ov = (prev.item as unknown as Record<string, unknown>)[f.key];
          const nv = (curr.item as unknown as Record<string, unknown>)[f.key];
          if (!eq(ov, nv)) changes.push({ field: f.key, label: f.label, oldV: ov, newV: nv });
        }
        out.push({
          rev: curr.rev, prevRev: prev.rev, when,
          kind: changes.length ? "modified" : "unchanged",
          changes,
        });
      }
    }
    return out;
  }, [snapshots]);

  const modifications = events.filter((e) => e.kind === "modified" || e.kind === "added" || e.kind === "removed").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground">
          <History className="h-3 w-3 mr-1" />
          View Change History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            BOQ Item Change History
            <span className="ml-2 text-xs font-normal text-muted-foreground">{item.description || "(no description)"}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {modifications} change{modifications === 1 ? "" : "s"} across {rows.length} revision{rows.length === 1 ? "" : "s"}
            </Badge>
          </div>
          {loading && <div className="text-muted-foreground">Loading history…</div>}
          {!loading && events.length === 0 && (
            <div className="text-muted-foreground italic">No changes recorded for this item yet.</div>
          )}
          {!loading && events.map((ev, i) => {
            const title =
              ev.kind === "baseline" ? `Initial values in R${ev.rev}` :
              ev.kind === "added" ? `Added in R${ev.rev}` :
              ev.kind === "removed" ? `Removed in R${ev.rev}` :
              ev.kind === "unchanged" ? `R${ev.prevRev} → R${ev.rev}` :
              `Modified · R${ev.prevRev} → R${ev.rev}`;
            return (
              <div key={i} className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-medium">{title}</div>
                  <div className="text-[11px] text-muted-foreground">{ev.when}</div>
                </div>
                {ev.kind === "unchanged" && (
                  <div className="text-[11px] text-muted-foreground italic">No changes to this item in R{ev.rev}.</div>
                )}
                {ev.kind === "baseline" && ev.snapshot && (
                  <table className="w-full">
                    <thead className="bg-muted/40">
                      <tr className="text-left"><th className="p-2">Field</th><th className="p-2">Current Value</th></tr>
                    </thead>
                    <tbody>
                      {ev.snapshot.map((s) => (
                        <tr key={s.field} className="border-t">
                          <td className="p-2 font-medium">{s.label}</td>
                          <td className="p-2 whitespace-pre-wrap">{fmt(s.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {ev.kind !== "baseline" && ev.kind !== "unchanged" && ev.changes.length > 0 && (
                  <table className="w-full">
                    <thead className="bg-muted/40">
                      <tr className="text-left">
                        <th className="p-2">Field</th>
                        <th className="p-2">Previous Value</th>
                        <th className="p-2">Updated Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.changes.map((c) => (
                        <tr key={c.field} className="border-t">
                          <td className="p-2 font-medium">{c.label}</td>
                          <td className="p-2 line-through text-muted-foreground whitespace-pre-wrap">{fmt(c.oldV)}</td>
                          <td className="p-2 whitespace-pre-wrap">{fmt(c.newV)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

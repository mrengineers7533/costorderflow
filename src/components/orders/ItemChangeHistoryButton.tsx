import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { History } from "lucide-react";
import type { LineItem, OrderRecord } from "@/lib/orders/types";

type FieldKey =
  | "description"
  | "make_label"
  | "make"
  | "quantity"
  | "unit"
  | "unit_rate"
  | "amount"
  | "model"
  | "remarks";

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "model", label: "Model" },
  { key: "make_label", label: "Make" },
  { key: "make", label: "Make Group" },
  { key: "quantity", label: "Qty" },
  { key: "unit", label: "Unit" },
  { key: "unit_rate", label: "Rate" },
  { key: "amount", label: "Amount" },
  { key: "remarks", label: "Remarks" },
];

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    n || 0,
  );
}
function signed(n: number): string {
  if (!n) return "₹0";
  return `${n > 0 ? "+" : "−"}₹${inr(Math.abs(n))}`;
}
function fmt(field: FieldKey, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "unit_rate" || field === "amount")
    return `₹${inr(Number(v) || 0)}`;
  return String(v);
}
function eq(a: unknown, b: unknown): boolean {
  const na = a == null || a === "" ? null : a;
  const nb = b == null || b === "" ? null : b;
  if (typeof na === "number" || typeof nb === "number")
    return Number(na || 0) === Number(nb || 0);
  return String(na ?? "") === String(nb ?? "");
}
function keyOf(it: LineItem): string {
  return (
    (it.id || "").trim() ||
    `desc:${(it.description || "").trim().toLowerCase()}`
  );
}

interface Props {
  rootOrderId: string | null;
  item: LineItem;
  approvalStatus?: string;
}

export function ItemChangeHistoryButton({
  rootOrderId,
  item,
  approvalStatus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const itemKey = keyOf(item);

  useEffect(() => {
    if (!open || !rootOrderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("orders")
          .select("*")
          .or(`id.eq.${rootOrderId},parent_order_id.eq.${rootOrderId}`);
        const list = ((data as unknown as OrderRecord[]) || [])
          .slice()
          .sort((a, b) => (a.revision ?? 0) - (b.revision ?? 0));
        if (!cancelled) setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rootOrderId]);

  // For each revision, the snapshot of this item (matched by key).
  const snapshots = useMemo(() => {
    return rows.map((r) => {
      const items = (r.line_items || []) as LineItem[];
      const match = items.find((it) => keyOf(it) === itemKey);
      return { rev: r.revision ?? 0, order: r, item: match };
    });
  }, [rows, itemKey]);

  // Build change events between consecutive revisions where the item existed.
  const events = useMemo(() => {
    const out: {
      rev: number;
      prevRev: number;
      when: string;
      kind: "added" | "removed" | "modified" | "unchanged";
      changes: { field: FieldKey; label: string; oldV: unknown; newV: unknown }[];
      oldAmount: number;
      newAmount: number;
      delta: number;
    }[] = [];
    for (let i = 0; i < snapshots.length; i++) {
      const curr = snapshots[i];
      const prev = i > 0 ? snapshots[i - 1] : null;
      const when = new Date(
        curr.order.order_date || curr.order.created_at,
      ).toLocaleString("en-IN");
      if (!curr.item && prev?.item) {
        out.push({
          rev: curr.rev,
          prevRev: prev.rev,
          when,
          kind: "removed",
          changes: [],
          oldAmount: Number(prev.item.amount) || 0,
          newAmount: 0,
          delta: -(Number(prev.item.amount) || 0),
        });
        continue;
      }
      if (curr.item && !prev?.item) {
        out.push({
          rev: curr.rev,
          prevRev: prev?.rev ?? -1,
          when,
          kind: i === 0 ? "added" : "added",
          changes: FIELDS.map((f) => ({
            field: f.key,
            label: f.label,
            oldV: undefined,
            newV: (curr.item as unknown as Record<string, unknown>)[f.key],
          })).filter((c) => c.newV != null && c.newV !== ""),
          oldAmount: 0,
          newAmount: Number(curr.item.amount) || 0,
          delta: Number(curr.item.amount) || 0,
        });
        continue;
      }
      if (curr.item && prev?.item) {
        const changes: {
          field: FieldKey;
          label: string;
          oldV: unknown;
          newV: unknown;
        }[] = [];
        for (const f of FIELDS) {
          const ov = (prev.item as unknown as Record<string, unknown>)[f.key];
          const nv = (curr.item as unknown as Record<string, unknown>)[f.key];
          if (!eq(ov, nv))
            changes.push({ field: f.key, label: f.label, oldV: ov, newV: nv });
        }
        if (changes.length) {
          out.push({
            rev: curr.rev,
            prevRev: prev.rev,
            when,
            kind: "modified",
            changes,
            oldAmount: Number(prev.item.amount) || 0,
            newAmount: Number(curr.item.amount) || 0,
            delta:
              (Number(curr.item.amount) || 0) -
              (Number(prev.item.amount) || 0),
          });
        }
      }
    }
    return out;
  }, [snapshots]);

  const modifications = events.filter((e) => e.kind !== "unchanged").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <History className="h-3 w-3 mr-1" />
          View Change History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Item Change History
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {item.description || "(no description)"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {modifications} change{modifications === 1 ? "" : "s"} across{" "}
              {rows.length} revision{rows.length === 1 ? "" : "s"}
            </Badge>
            {approvalStatus && (
              <Badge variant="outline" className="text-[10px] uppercase">
                Current approval: {approvalStatus}
              </Badge>
            )}
          </div>

          {loading && (
            <div className="text-muted-foreground">Loading history…</div>
          )}

          {!loading && events.length === 0 && (
            <div className="text-muted-foreground italic">
              No changes recorded for this item yet.
            </div>
          )}

          {!loading &&
            events.map((ev, i) => {
              const color =
                ev.delta > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : ev.delta < 0
                  ? "text-red-700 dark:text-red-400"
                  : "text-muted-foreground";
              const title =
                ev.kind === "added"
                  ? `Added in R${ev.rev}`
                  : ev.kind === "removed"
                  ? `Removed in R${ev.rev}`
                  : `Modified · R${ev.prevRev} → R${ev.rev}`;
              return (
                <div key={i} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="font-medium">{title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ev.when}
                    </div>
                  </div>
                  {ev.changes.length > 0 && (
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
                            <td className="p-2 line-through text-muted-foreground whitespace-pre-wrap">
                              {fmt(c.field, c.oldV)}
                            </td>
                            <td className="p-2 whitespace-pre-wrap">
                              {fmt(c.field, c.newV)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      Amount: ₹{inr(ev.oldAmount)} → ₹{inr(ev.newAmount)}
                    </div>
                    <div className={`text-[11px] font-medium ${color}`}>
                      {ev.delta === 0
                        ? "No price impact"
                        : `${signed(ev.delta)} · OA ${ev.delta > 0 ? "increased" : "decreased"} by ₹${inr(Math.abs(ev.delta))}`}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
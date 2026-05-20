import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ChevronDown, ChevronRight, History } from "lucide-react";
import type { LineItem, OrderRecord } from "@/lib/orders/types";

type FieldKey = "description" | "make_label" | "make" | "quantity" | "unit" | "unit_rate" | "amount" | "model" | "remarks";

interface FieldChange {
  field: FieldKey;
  label: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
}

interface ItemDiff {
  kind: "added" | "removed" | "modified";
  key: string;
  description: string;
  oldAmount: number;
  newAmount: number;
  amountDelta: number;
  changes: FieldChange[];
}

interface RevisionDiff {
  added: ItemDiff[];
  removed: ItemDiff[];
  modified: ItemDiff[];
  basicOld: number;
  basicNew: number;
  basicDelta: number;
}

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "description", label: "Description" },
  { key: "make_label", label: "Make" },
  { key: "make", label: "Make Group" },
  { key: "quantity", label: "Qty" },
  { key: "unit", label: "Unit" },
  { key: "unit_rate", label: "Rate" },
  { key: "amount", label: "Amount" },
  { key: "model", label: "Model" },
  { key: "remarks", label: "Remarks" },
];

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n || 0);
}
function signed(n: number): string {
  if (!n) return "₹0";
  const s = n > 0 ? "+" : "−";
  return `${s}₹${inr(Math.abs(n))}`;
}
function keyOf(it: LineItem): string {
  return (it.id || "").trim() || `desc:${(it.description || "").trim().toLowerCase()}`;
}
function eq(a: unknown, b: unknown): boolean {
  const na = a == null || a === "" ? null : a;
  const nb = b == null || b === "" ? null : b;
  if (typeof na === "number" || typeof nb === "number") {
    return Number(na || 0) === Number(nb || 0);
  }
  return String(na ?? "") === String(nb ?? "");
}

function diffRevisions(prev: OrderRecord, curr: OrderRecord): RevisionDiff {
  const prevItems = (prev.line_items || []) as LineItem[];
  const currItems = (curr.line_items || []) as LineItem[];
  const prevMap = new Map(prevItems.map((it) => [keyOf(it), it]));
  const currMap = new Map(currItems.map((it) => [keyOf(it), it]));

  const added: ItemDiff[] = [];
  const removed: ItemDiff[] = [];
  const modified: ItemDiff[] = [];

  for (const [k, it] of currMap) {
    if (!prevMap.has(k)) {
      added.push({
        kind: "added", key: k, description: it.description || "(no description)",
        oldAmount: 0, newAmount: Number(it.amount) || 0, amountDelta: Number(it.amount) || 0,
        changes: [],
      });
    }
  }
  for (const [k, it] of prevMap) {
    if (!currMap.has(k)) {
      removed.push({
        kind: "removed", key: k, description: it.description || "(no description)",
        oldAmount: Number(it.amount) || 0, newAmount: 0, amountDelta: -(Number(it.amount) || 0),
        changes: [],
      });
    }
  }
  for (const [k, pIt] of prevMap) {
    const cIt = currMap.get(k);
    if (!cIt) continue;
    const changes: FieldChange[] = [];
    for (const f of FIELDS) {
      const ov = (pIt as unknown as Record<string, unknown>)[f.key];
      const nv = (cIt as unknown as Record<string, unknown>)[f.key];
      if (!eq(ov, nv)) {
        changes.push({
          field: f.key, label: f.label,
          oldValue: ov as string | number | null | undefined,
          newValue: nv as string | number | null | undefined,
        });
      }
    }
    if (changes.length) {
      const oa = Number(pIt.amount) || 0;
      const na = Number(cIt.amount) || 0;
      modified.push({
        kind: "modified", key: k, description: cIt.description || pIt.description || "",
        oldAmount: oa, newAmount: na, amountDelta: na - oa, changes,
      });
    }
  }

  const basicOld = Number(prev.totals?.basic_total) || prevItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const basicNew = Number(curr.totals?.basic_total) || currItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return { added, removed, modified, basicOld, basicNew, basicDelta: basicNew - basicOld };
}

function formatVal(field: FieldKey, v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  if (field === "unit_rate" || field === "amount") return `₹${inr(Number(v) || 0)}`;
  return String(v);
}

export function OaRevisionHistory({ currentOrderId, rootOrderId }: { currentOrderId: string; rootOrderId: string }) {
  const [rows, setRows] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [openRev, setOpenRev] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!rootOrderId) return;
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
    return () => { cancelled = true; };
  }, [rootOrderId]);

  // Build per-revision diffs (R1 vs R0, R2 vs R1, …). Hidden until expanded.
  const diffs = useMemo(() => {
    const out: { curr: OrderRecord; prev: OrderRecord; diff: RevisionDiff }[] = [];
    for (let i = 1; i < rows.length; i++) {
      out.push({ curr: rows[i], prev: rows[i - 1], diff: diffRevisions(rows[i - 1], rows[i]) });
    }
    return out;
  }, [rows]);

  const totalChanges = diffs.reduce(
    (s, d) => s + d.diff.added.length + d.diff.removed.length + d.diff.modified.length, 0,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">OA Revision History</CardTitle>
            <p className="text-xs text-muted-foreground">
              All saved revisions for this OA family. Open any prior revision in read-only view.
            </p>
          </div>
          {rows.length > 1 && (
            <Button size="sm" variant={showFull ? "secondary" : "outline"} onClick={() => setShowFull((v) => !v)}>
              <History className="h-3 w-3 mr-1" />
              {showFull ? "Hide" : "View"} Full Change History
              <Badge variant="outline" className="ml-2 text-[10px]">{totalChanges}</Badge>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-16">Rev</th>
                <th className="p-2">OA Number</th>
                <th className="p-2">Date</th>
                <th className="p-2">Created/Updated By</th>
                <th className="p-2">Status</th>
                <th className="p-2 w-28 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">No revisions yet.</td></tr>
              )}
              {rows.map((r) => {
                const isViewing = r.id === currentOrderId;
                const rev = r.revision ?? 0;
                const base = (r.oa_number || "").replace(/\/R\d+$/i, "");
                const display = rev > 0 ? `${base}/R${rev}` : base;
                return (
                  <tr key={r.id} className={`border-t ${isViewing ? "bg-primary/5" : ""}`}>
                    <td className="p-2 font-mono">R{rev}</td>
                    <td className="p-2 font-mono">{display}</td>
                    <td className="p-2">{new Date(r.order_date || r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="p-2">{r.prepared_by || "—"}</td>
                    <td className="p-2">
                      {r.is_current
                        ? <Badge className="text-[9px] uppercase">Current</Badge>
                        : <Badge variant="outline" className="text-[9px] uppercase">Superseded</Badge>}
                      {isViewing && <Badge variant="secondary" className="ml-1 text-[9px] uppercase">Viewing</Badge>}
                    </td>
                    <td className="p-2 text-right">
                      {isViewing ? (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/orders/${r.id}`}><Eye className="h-3 w-3 mr-1" />View</Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showFull && diffs.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Showing {diffs.length} revision change{diffs.length === 1 ? "" : "s"} · {totalChanges} item update{totalChanges === 1 ? "" : "s"} in total.
            </div>
            {diffs.map(({ curr, prev, diff }) => {
              const rev = curr.revision ?? 0;
              const id = curr.id;
              const open = openRev[id] ?? true;
              const impactColor = diff.basicDelta > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : diff.basicDelta < 0
                ? "text-red-700 dark:text-red-400"
                : "text-muted-foreground";
              return (
                <div key={id} className="rounded-md border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setOpenRev((s) => ({ ...s, [id]: !open }))}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="font-mono">R{prev.revision ?? 0} → R{rev}</span>
                      <Badge variant="outline" className="text-[10px]">{new Date(curr.order_date || curr.created_at).toLocaleString("en-IN")}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {diff.added.length} added · {diff.removed.length} removed · {diff.modified.length} modified
                      </span>
                    </div>
                    <div className={`text-xs font-medium ${impactColor}`}>
                      OA Basic: ₹{inr(diff.basicOld)} → ₹{inr(diff.basicNew)} ({signed(diff.basicDelta)})
                      {diff.basicDelta !== 0 && (
                        <span className="ml-1">— OA {diff.basicDelta > 0 ? "increased" : "decreased"} by ₹{inr(Math.abs(diff.basicDelta))}</span>
                      )}
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 space-y-3">
                      {diff.modified.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Modified items</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50">
                                <tr className="text-left">
                                  <th className="p-2">Item</th>
                                  <th className="p-2">Field</th>
                                  <th className="p-2">Previous Value</th>
                                  <th className="p-2">Updated Value</th>
                                  <th className="p-2 text-right">Amount Δ</th>
                                  <th className="p-2 text-right">OA Impact</th>
                                </tr>
                              </thead>
                              <tbody>
                                {diff.modified.map((m) => (
                                  m.changes.map((c, ci) => (
                                    <tr key={`${m.key}-${c.field}`} className="border-t align-top">
                                      {ci === 0 ? (
                                        <td className="p-2 align-top" rowSpan={m.changes.length}>{m.description}</td>
                                      ) : null}
                                      <td className="p-2 font-medium">{c.label}</td>
                                      <td className="p-2 line-through text-muted-foreground whitespace-pre-wrap">{formatVal(c.field, c.oldValue)}</td>
                                      <td className="p-2 whitespace-pre-wrap">{formatVal(c.field, c.newValue)}</td>
                                      {ci === 0 ? (
                                        <td className="p-2 text-right align-top" rowSpan={m.changes.length}>
                                          <div>₹{inr(m.oldAmount)} → ₹{inr(m.newAmount)}</div>
                                          <div className={m.amountDelta > 0 ? "text-emerald-700 dark:text-emerald-400" : m.amountDelta < 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                                            {signed(m.amountDelta)}
                                          </div>
                                        </td>
                                      ) : null}
                                      {ci === 0 ? (
                                        <td className="p-2 text-right align-top text-[11px]" rowSpan={m.changes.length}>
                                          {m.amountDelta === 0
                                            ? <span className="text-muted-foreground">No OA impact</span>
                                            : <span className={m.amountDelta > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
                                                OA {m.amountDelta > 0 ? "increased" : "decreased"} by ₹{inr(Math.abs(m.amountDelta))}
                                              </span>}
                                        </td>
                                      ) : null}
                                    </tr>
                                  ))
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {diff.added.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Added items</div>
                          <ul className="text-xs space-y-1">
                            {diff.added.map((m) => (
                              <li key={m.key} className="flex items-center justify-between gap-2 border-t py-1">
                                <span>{m.description}</span>
                                <span className="text-emerald-700 dark:text-emerald-400">+₹{inr(m.newAmount)} · OA increased by ₹{inr(m.newAmount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diff.removed.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-1">Removed items</div>
                          <ul className="text-xs space-y-1">
                            {diff.removed.map((m) => (
                              <li key={m.key} className="flex items-center justify-between gap-2 border-t py-1">
                                <span className="line-through text-muted-foreground">{m.description}</span>
                                <span className="text-red-700 dark:text-red-400">−₹{inr(m.oldAmount)} · OA decreased by ₹{inr(m.oldAmount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {diff.added.length + diff.removed.length + diff.modified.length === 0 && (
                        <div className="text-xs text-muted-foreground">No item-level differences detected between these revisions.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showFull && diffs.length === 0 && (
          <div className="text-xs text-muted-foreground">Only one revision exists — no change history yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

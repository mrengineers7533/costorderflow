import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, MessageSquarePlus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { sortByItemNo } from "@/lib/boq/types";
import { addDesignComment, fetchDesignComments, type DesignComment } from "@/lib/design/comments";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";
import { DesignStatusCell, statusBadge, type DesignStatus } from "@/components/design/DesignStatusCell";

type ColKey = "model_number" | "description" | "quantity" | "unit" | "motor" | "motor_quantity" | "remarks";
const COLS: { key: ColKey; label: string }[] = [
  { key: "model_number", label: "Model" },
  { key: "description", label: "Description" },
  { key: "quantity", label: "Qty" },
  { key: "unit", label: "Unit" },
  { key: "motor", label: "Motor" },
  { key: "motor_quantity", label: "Motor Qty" },
  { key: "remarks", label: "Remarks" },
];

export default function DesignBoqView() {
  const { id } = useParams();
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [comments, setComments] = useState<DesignComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ itemId: string; column: ColKey | "row"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, { status: DesignStatus; reason?: string | null }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function refresh() {
    if (!id) return;
    setLoading(true);
    const [{ data: b }, list] = await Promise.all([
      supabase.from("boqs").select("*").eq("id", id).maybeSingle(),
      fetchDesignComments(id),
    ]);
    const boqRow = (b || null) as unknown as BoqRecord | null;
    setBoq(boqRow);
    setComments(list);
    if (boqRow) {
      const { data: st } = await supabase
        .from("boq_item_design_status" as never)
        .select("boq_item_id,status,reason")
        .eq("boq_id", boqRow.id)
        .eq("boq_revision", boqRow.revision ?? 0);
      const m: Record<string, { status: DesignStatus; reason?: string | null }> = {};
      for (const r of ((st || []) as unknown as Array<{ boq_item_id: string; status: DesignStatus; reason: string | null }>)) {
        m[r.boq_item_id] = { status: r.status, reason: r.reason };
      }
      setStatusMap(m);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const items = useMemo<BoqLineItem[]>(
    () => sortByItemNo((boq?.line_items as BoqLineItem[]) || []),
    [boq],
  );

  const commentsByItem = useMemo(() => {
    const m: Record<string, DesignComment[]> = {};
    for (const c of comments) (m[c.boq_item_id] ||= []).push(c);
    return m;
  }, [comments]);

  const commentsCountByCell = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of comments) {
      if (!c.column_key) continue;
      m[`${c.boq_item_id}::${c.column_key}`] =
        (m[`${c.boq_item_id}::${c.column_key}`] || 0) + 1;
    }
    return m;
  }, [comments]);

  async function setStatus(itemId: string, status: DesignStatus, reason?: string) {
    if (!boq) return;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || "User";
    const { error } = await supabase.from("boq_item_design_status" as never).upsert({
      boq_id: boq.id,
      boq_revision: boq.revision ?? 0,
      boq_item_id: itemId,
      status,
      reason: reason || null,
      decided_by: user?.id || null,
      decided_by_name: name,
      decided_by_department: "Design",
      decided_at: new Date().toISOString(),
    } as never, { onConflict: "boq_id,boq_revision,boq_item_id" } as never);
    if (error) { toast({ title: "Could not save status", description: error.message, variant: "destructive" }); return; }
    setStatusMap((prev) => ({ ...prev, [itemId]: { status, reason } }));
    toast({ title: `Marked ${status.replace("_", " ")}` });
  }

  async function bulkSet(ids: string[], status: DesignStatus) {
    for (const id of ids) await setStatus(id, status);
  }

  function toggleSelect(itemId: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(itemId)) n.delete(itemId); else n.add(itemId);
      return n;
    });
  }

  async function submitDraft() {
    if (!draft || !id || !draft.text.trim()) return;
    setSaving(true);
    try {
      await addDesignComment({
        boqId: id,
        itemId: draft.itemId,
        columnKey: draft.column === "row" ? null : draft.column,
        comment: draft.text.trim(),
      });
      toast({ title: "Comment added", description: "Departments have been notified." });
      setDraft(null);
      await refresh();
    } catch (e) {
      toast({
        title: "Could not save comment",
        description: e instanceof Error ? e.message : "Permission denied.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading BOQ…
      </div>
    );
  }
  if (!boq) {
    return <div className="p-6 text-muted-foreground">BOQ not found.</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {id && <ModuleNotifications links={{ boqId: id }} />}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/design"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{boq.boq_number}</h1>
            <p className="text-xs text-muted-foreground">
              {boq.client_name || "—"} · OA: {boq.reference_oa_number || "—"} · {boq.format}
            </p>
          </div>
        </div>
        <Badge variant="secondary">Read-only · Design view</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Line items</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkSet(items.map((i) => i.id), "approved")}>
                Approve All
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkSet(items.map((i) => i.id), "pending")}>
                Mark All Pending
              </Button>
              <Button size="sm" variant="destructive" disabled={selected.size === 0}
                      onClick={() => bulkSet(Array.from(selected), "not_approved")}>
                Mark Selected Not Approved ({selected.size})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="w-12">#</TableHead>
                {COLS.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right">Comments</TableHead>
                <TableHead className="w-44">Design Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLS.length + 4} className="text-center text-muted-foreground py-6">
                    No line items.
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => {
                const rowComments = commentsByItem[it.id] || [];
                const open = activeRow === it.id;
                const st = statusMap[it.id]?.status ?? "pending";
                return (
                  <Fragment key={it.id}>
                    <TableRow>
                      <TableCell>
                        <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleSelect(it.id)} />
                      </TableCell>
                      <TableCell>{it.item_no}</TableCell>
                      {COLS.map((c) => {
                        const cellKey = `${it.id}::${c.key}`;
                        const count = commentsCountByCell[cellKey] || 0;
                        const val = (it as unknown as Record<string, unknown>)[c.key];
                        return (
                          <TableCell key={c.key} className="align-top">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-start gap-1">
                                <span className="whitespace-pre-wrap">
                                  {val == null || val === "" ? "—" : String(val)}
                                </span>
                                {count > 0 && (
                                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                    {count}
                                  </Badge>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveRow(it.id);
                                  setDraft({ itemId: it.id, column: c.key, text: "" });
                                }}
                                className="self-start text-[11px] text-muted-foreground hover:text-primary hover:underline"
                                title={`Add a comment on ${c.label}`}
                              >
                                + Comment
                              </button>
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActiveRow(open ? null : it.id);
                            setDraft(open ? null : { itemId: it.id, column: "row", text: "" });
                          }}
                        >
                          <MessageSquarePlus className="h-4 w-4 mr-1" />
                          {rowComments.length || "Add"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <DesignStatusCell value={st} onChange={(s, r) => setStatus(it.id, s, r)} />
                          {st === "not_approved" && statusMap[it.id]?.reason && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={statusMap[it.id]?.reason || ""}>
                              {statusMap[it.id]?.reason}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={COLS.length + 4} className="bg-muted/30">
                          <div className="space-y-3 p-2">
                            {rowComments.length === 0 && (
                              <div className="text-xs text-muted-foreground">No comments yet.</div>
                            )}
                            {rowComments.map((c) => (
                              <div key={c.id} className="text-sm border-l-2 border-primary/40 pl-2">
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">{c.user_name || "User"}</span>
                                  {c.department && <span> · {c.department}</span>}
                                  {c.column_key && <span> · {c.column_key}</span>}
                                  <span> · {new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{c.comment}</div>
                              </div>
                            ))}
                            {draft && draft.itemId === it.id && (
                              <div className="space-y-2">
                                <div className="text-xs text-muted-foreground">
                                  Commenting on:{" "}
                                  <span className="font-medium text-foreground">
                                    {draft.column === "row" ? "whole row" : draft.column}
                                  </span>
                                </div>
                                <Textarea
                                  value={draft.text}
                                  onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                                  placeholder="Type your comment…"
                                  rows={2}
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                                    Cancel
                                  </Button>
                                  <Button size="sm" disabled={saving || !draft.text.trim()} onClick={submitDraft}>
                                    {saving ? "Saving…" : "Post comment"}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
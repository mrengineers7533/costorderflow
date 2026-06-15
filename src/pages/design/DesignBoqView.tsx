import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, Loader2, CheckCircle2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqLineItem, BoqRecord } from "@/lib/boq/types";
import { sortByItemNo } from "@/lib/boq/types";
import {
  approveRevisedBoq,
  fetchDesignComments,
  submitDesignComments,
  upsertDesignComment,
  type DesignComment,
} from "@/lib/design/comments";
import { ModuleNotifications } from "@/components/notifications/ModuleNotifications";
import { BoqRevisionHistory } from "@/components/boqs/BoqRevisionHistory";

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

type BoqWithReview = BoqRecord & { design_review_status?: string | null };

export default function DesignBoqView() {
  const { id } = useParams();
  const [boq, setBoq] = useState<BoqWithReview | null>(null);
  const [comments, setComments] = useState<DesignComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const keyOf = (itemId: string, col: string) => `${itemId}::${col}`;

  async function refresh() {
    if (!id) return;
    setLoading(true);
    const [{ data: b }, list, { data: auth }] = await Promise.all([
      supabase.from("boqs").select("*").eq("id", id).maybeSingle(),
      fetchDesignComments(id),
      supabase.auth.getUser(),
    ]);
    const boqRow = (b || null) as unknown as BoqWithReview | null;
    setBoq(boqRow);
    setComments(list);
    const uid = auth.user?.id || null;
    setMyUserId(uid);
    // Hydrate drafts from the current user's existing comments so editing
    // re-edits the same row instead of creating duplicates.
    if (uid) {
      const d: Record<string, string> = {};
      for (const c of list) {
        if (c.user_id !== uid) continue;
        d[keyOf(c.boq_item_id, c.column_key || "__row__")] = c.comment || "";
      }
      setDrafts(d);
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

  const otherCommentsByCell = useMemo(() => {
    const m: Record<string, DesignComment[]> = {};
    for (const c of comments) {
      if (c.user_id && c.user_id === myUserId) continue;
      const k = keyOf(c.boq_item_id, c.column_key || "__row__");
      (m[k] ||= []).push(c);
    }
    return m;
  }, [comments, myUserId]);

  const myDraftCount = useMemo(
    () => Object.values(drafts).filter((v) => v.trim().length > 0).length,
    [drafts],
  );

  function scheduleSave(itemId: string, col: ColKey | "row", value: string) {
    if (!id) return;
    const k = keyOf(itemId, col === "row" ? "__row__" : col);
    setDrafts((prev) => ({ ...prev, [k]: value }));
    const existing = debounceRef.current[k];
    if (existing) clearTimeout(existing);
    debounceRef.current[k] = setTimeout(() => {
      void saveNow(itemId, col, value);
    }, 600);
  }

  async function saveNow(itemId: string, col: ColKey | "row", value: string) {
    if (!id) return;
    const k = keyOf(itemId, col === "row" ? "__row__" : col);
    const existing = debounceRef.current[k];
    if (existing) { clearTimeout(existing); delete debounceRef.current[k]; }
    setSavingKey((p) => ({ ...p, [k]: true }));
    try {
      await upsertDesignComment({
        boqId: id,
        itemId,
        columnKey: col === "row" ? null : col,
        comment: value,
      });
      setSavedAt((p) => ({ ...p, [k]: Date.now() }));
    } catch (e) {
      toast({
        title: "Could not auto-save comment",
        description: e instanceof Error ? e.message : "Permission denied.",
        variant: "destructive",
      });
    } finally {
      setSavingKey((p) => ({ ...p, [k]: false }));
    }
  }

  const reviewStatus = (boq?.design_review_status || "draft") as string;
  const alreadySubmitted = reviewStatus === "changes_requested";
  const designApproved = reviewStatus === "design_approved" || reviewStatus === "final_sent";
  // Approve only on a BOQ revision that came AFTER comments were submitted.
  // Heuristic: comments + status=changes_requested were on the previous
  // revision; OA Creator publishes a new revision (revision increments,
  // design_review_status resets to "boq_updated" / "draft").
  const canApprove =
    !!boq &&
    !designApproved &&
    (boq.revision ?? 0) > 0 &&
    reviewStatus !== "changes_requested";

  async function handlePostSubmit() {
    if (!id) return;
    // Flush any pending debounced saves first.
    const pending = Object.keys(debounceRef.current);
    for (const k of pending) {
      const t = debounceRef.current[k];
      if (t) clearTimeout(t);
      delete debounceRef.current[k];
    }
    setSubmitting(true);
    try {
      // Persist any unsaved drafts before flipping status.
      const tasks: Promise<unknown>[] = [];
      for (const [k, v] of Object.entries(drafts)) {
        const [itemId, col] = k.split("::");
        tasks.push(
          upsertDesignComment({
            boqId: id,
            itemId,
            columnKey: col === "__row__" ? null : col,
            comment: v,
          }),
        );
      }
      await Promise.all(tasks);
      await submitDesignComments(id);
      toast({ title: "Comments submitted", description: "OA Creator has been notified to revise the BOQ." });
      await refresh();
    } catch (e) {
      toast({
        title: "Could not submit",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!id) return;
    setApproving(true);
    try {
      await approveRevisedBoq(id);
      toast({ title: "BOQ approved", description: "Released to Purchase & Manufacturing." });
      await refresh();
    } catch (e) {
      toast({
        title: "Could not approve",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setApproving(false);
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
    <div className="space-y-4 p-4 md:p-6 pb-28">
      {id && <ModuleNotifications links={{ boqId: id }} />}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/design"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{boq.boq_number}</h1>
            <p className="text-xs text-muted-foreground">
              {boq.client_name || "—"} · OA: {boq.reference_oa_number || "—"} · {boq.format} · R{boq.revision ?? 0}
            </p>
          </div>
        </div>
        {designApproved ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600">Design Approved</Badge>
        ) : alreadySubmitted ? (
          <Badge variant="destructive">Changes Requested — awaiting OA revision</Badge>
        ) : (
          <Badge variant="secondary">Open for Design review</Badge>
        )}
      </div>

      <BoqRevisionHistory currentBoqId={boq.id} orderId={boq.order_id} linkBase="/design" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
          <p className="text-xs text-muted-foreground">
            Add comments on any line item — not every row needs a comment. Comments auto-save as you type. When done, click <span className="font-medium text-foreground">Post Submit</span> at the bottom.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {COLS.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="min-w-[260px]">Design Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLS.length + 2} className="text-center text-muted-foreground py-6">
                    No line items.
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => {
                const k = keyOf(it.id, "__row__");
                const others = otherCommentsByCell[k] || [];
                const value = drafts[k] || "";
                const saving = savingKey[k];
                const ts = savedAt[k];
                const disabled = alreadySubmitted || designApproved;
                return (
                  <Fragment key={it.id}>
                    <TableRow className="align-top">
                      <TableCell>{it.item_no}</TableCell>
                      {COLS.map((c) => {
                        const val = (it as unknown as Record<string, unknown>)[c.key];
                        return (
                          <TableCell key={c.key} className="align-top">
                            <span className="whitespace-pre-wrap">
                              {val == null || val === "" ? "—" : String(val)}
                            </span>
                          </TableCell>
                        );
                      })}
                      <TableCell className="align-top">
                        <Textarea
                          rows={2}
                          value={value}
                          disabled={disabled}
                          placeholder={disabled ? "Comments locked" : "Add a comment for this line…"}
                          onChange={(e) => scheduleSave(it.id, "row", e.target.value)}
                          onBlur={(e) => void saveNow(it.id, "row", e.target.value)}
                        />
                        <div className="mt-1 text-[10px] text-muted-foreground h-4">
                          {saving ? "Saving…" : ts ? `Saved · ${new Date(ts).toLocaleTimeString()}` : ""}
                        </div>
                        {others.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {others.map((c) => (
                              <div key={c.id} className="text-[11px] border-l-2 border-primary/40 pl-2">
                                <div className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{c.user_name || "User"}</span>
                                  {c.department && <span> · {c.department}</span>}
                                  <span> · {new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <div className="whitespace-pre-wrap">{c.comment}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Sticky bottom action bar — single Post Submit + Approve (revised only) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {designApproved
              ? "This BOQ is design-approved and released to Purchase & Manufacturing."
              : alreadySubmitted
                ? "Comments submitted. Awaiting OA Creator to publish a revised BOQ."
                : `${myDraftCount} comment${myDraftCount === 1 ? "" : "s"} ready to submit.`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePostSubmit}
              disabled={submitting || disabledSubmit(myDraftCount, alreadySubmitted, designApproved)}
            >
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Submitting…" : `Post Submit${myDraftCount ? ` (${myDraftCount})` : ""}`}
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant={canApprove ? "default" : "outline"}
                      onClick={handleApprove}
                      disabled={!canApprove || approving}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {designApproved ? "Approved" : approving ? "Approving…" : "Approve Revised BOQ"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canApprove && !designApproved && (
                  <TooltipContent>
                    Waiting for OA Creator to publish the revised BOQ.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}

function disabledSubmit(count: number, submitted: boolean, approved: boolean) {
  if (approved || submitted) return true;
  return count === 0;
}
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  fetchItemApprovals,
  setItemApproval,
  bulkSetItemApprovals,
  syncApprovalToBoqSnapshot,
  type ItemApproval,
} from "@/lib/design/itemApprovals";
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
  const [unapproving, setUnapproving] = useState(false);
  const [approvals, setApprovals] = useState<Record<string, ItemApproval>>({});
  const [savingApprovalId, setSavingApprovalId] = useState<string | null>(null);
  const [bulking, setBulking] = useState(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedValuesRef = useRef<Record<string, string>>({});
  const autoUnapprovingRef = useRef(false);
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
    if (boqRow) {
      try {
        const map = await fetchItemApprovals(boqRow.id, boqRow.revision ?? 0);
        setApprovals(map);
      } catch {
        setApprovals({});
      }
    } else {
      setApprovals({});
    }
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
      savedValuesRef.current = { ...d };
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
      const previous = savedValuesRef.current[k] ?? "";
      const changed = previous !== value;
      savedValuesRef.current[k] = value;
      // Auto-clear per-item approval when its comment is added/edited.
      if (changed && boq && approvals[itemId]?.status === "approved") {
        try {
          await setItemApproval(boq.id, itemId, boq.revision ?? 0, "pending");
          await syncApprovalToBoqSnapshot(boq.id, [itemId], "pending");
          setApprovals((p) => ({
            ...p,
            [itemId]: {
              status: "pending",
              decided_by_name: null,
              decided_by_department: null,
              decided_at: null,
            },
          }));
        } catch (e) {
          toast({
            title: "Could not clear item approval",
            description: e instanceof Error ? e.message : "Try again.",
            variant: "destructive",
          });
        }
      }
      if (changed && designApproved && !autoUnapprovingRef.current) {
        autoUnapprovingRef.current = true;
        try {
          const { error } = await supabase
            .from("boqs")
            .update({
              design_review_status: "draft",
              verification_status: "pending",
              verified_at: null,
            } as never)
            .eq("id", id);
          if (error) throw error;
          toast({
            title: "BOQ unapproved",
            description: "Comment added. Review and Approve again when ready.",
          });
          await refresh();
        } catch (e) {
          toast({
            title: "Could not auto-unapprove BOQ",
            description: e instanceof Error ? e.message : "Try again.",
            variant: "destructive",
          });
        } finally {
          autoUnapprovingRef.current = false;
        }
      }
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

  const approvedCount = useMemo(
    () => items.filter((it) => approvals[it.id]?.status === "approved").length,
    [items, approvals],
  );
  const approvalsDisabled = alreadySubmitted;
  const allApproved = items.length > 0 && approvedCount === items.length;

  async function bulkToggleAllApprovals() {
    if (!boq || items.length === 0) return;
    const next: "approved" | "pending" = allApproved ? "pending" : "approved";
    const msg = next === "approved"
      ? `Approve all ${items.length} items?`
      : `Remove approval from all ${items.length} items?`;
    if (!window.confirm(msg)) return;
    const revision = boq.revision ?? 0;
    const prevSnapshot = approvals;
    setBulking(true);
    setApprovals((p) => {
      const out: Record<string, ItemApproval> = { ...p };
      for (const it of items) {
        const prev = p[it.id];
        out[it.id] = {
          status: next,
          decided_by_name: prev?.decided_by_name ?? null,
          decided_by_department: prev?.decided_by_department ?? null,
          decided_at: prev?.decided_at ?? null,
        };
      }
      return out;
    });
    try {
      const ids = items.map((it) => it.id);
      await bulkSetItemApprovals(boq.id, ids, revision, next);
      await syncApprovalToBoqSnapshot(boq.id, ids, next);
      const map = await fetchItemApprovals(boq.id, revision);
      setApprovals(map);
      toast({
        title: next === "approved" ? "All items approved" : "All approvals removed",
      });
    } catch (e) {
      setApprovals(prevSnapshot);
      toast({
        title: "Could not update approvals",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBulking(false);
    }
  }

  async function toggleItemApproval(itemId: string, next: boolean) {
    if (!boq) return;
    const revision = boq.revision ?? 0;
    const prev = approvals[itemId];
    setApprovals((p) => ({
      ...p,
      [itemId]: {
        status: next ? "approved" : "pending",
        decided_by_name: prev?.decided_by_name ?? null,
        decided_by_department: prev?.decided_by_department ?? null,
        decided_at: prev?.decided_at ?? null,
      },
    }));
    setSavingApprovalId(itemId);
    try {
      await setItemApproval(boq.id, itemId, revision, next ? "approved" : "pending");
      await syncApprovalToBoqSnapshot(boq.id, [itemId], next ? "approved" : "pending");
      const map = await fetchItemApprovals(boq.id, revision);
      setApprovals(map);
    } catch (e) {
      setApprovals((p) => ({ ...p, [itemId]: prev || { status: "pending", decided_by_name: null, decided_by_department: null, decided_at: null } }));
      toast({
        title: "Could not update approval",
        description: e instanceof Error ? e.message : "Permission denied.",
        variant: "destructive",
      });
    } finally {
      setSavingApprovalId(null);
    }
  }

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
      // Ensure every line item is marked approved for this revision before finalizing.
      if (boq) {
        const revision = boq.revision ?? 0;
        const missing = items
          .filter((it) => approvals[it.id]?.status !== "approved")
          .map((it) => it.id);
        if (missing.length > 0) {
          await bulkSetItemApprovals(boq.id, missing, revision, "approved");
        }
        await syncApprovalToBoqSnapshot(
          boq.id,
          items.map((it) => it.id),
          "approved",
        );
      }
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

  async function handleUnapprove() {
    if (!id) return;
    if (!window.confirm("Unapprove this BOQ so Design can add more comments?")) return;
    setUnapproving(true);
    try {
      const { error } = await supabase
        .from("boqs")
        .update({
          design_review_status: "draft",
          verification_status: "pending",
          verified_at: null,
        } as never)
        .eq("id", id);
      if (error) throw error;
      toast({ title: "BOQ unapproved", description: "You can add comments and Post Submit again." });
      await refresh();
    } catch (e) {
      toast({
        title: "Could not unapprove",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUnapproving(false);
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
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Line items</CardTitle>
              <p className="text-xs text-muted-foreground">
                Add comments on any line item — not every row needs a comment. Comments auto-save as you type. When done, click <span className="font-medium text-foreground">Post Submit</span> at the bottom.
              </p>
            </div>
            <Button
              size="sm"
              variant={allApproved ? "outline" : "default"}
              onClick={() => void bulkToggleAllApprovals()}
              disabled={
                items.length === 0 || bulking || approvalsDisabled || designApproved
              }
            >
              {bulking
                ? "Working…"
                : allApproved
                  ? "Remove All Approvals"
                  : "Approve All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">
                  <span className="text-xs">Approve</span>
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                {COLS.map((c) => (
                  <TableHead key={c.key} className="min-w-[180px]">{c.label}</TableHead>
                ))}
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
                const disabled = false;
                const rowKey = keyOf(it.id, "__row__");
                const rowOthers = otherCommentsByCell[rowKey] || [];
                const ap = approvals[it.id];
                const isApproved = ap?.status === "approved";
                return (
                  <Fragment key={it.id}>
                    <TableRow className="align-top">
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isApproved}
                              disabled={approvalsDisabled || savingApprovalId === it.id}
                              onCheckedChange={(v) => void toggleItemApproval(it.id, !!v)}
                              aria-label={`Approve item ${it.item_no}`}
                            />
                            {isApproved ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge className="bg-emerald-600 hover:bg-emerald-600 h-5 px-1.5 text-[10px]">Approved</Badge>
                                  </TooltipTrigger>
                                  {(ap?.decided_by_name || ap?.decided_at) && (
                                    <TooltipContent>
                                      {ap?.decided_by_name || "User"}
                                      {ap?.decided_at ? ` · ${new Date(ap.decided_at).toLocaleString()}` : ""}
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Pending</Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{it.item_no}</TableCell>
                      {COLS.map((c) => {
                        const val = (it as unknown as Record<string, unknown>)[c.key];
                        const k = keyOf(it.id, c.key);
                        const value = drafts[k] || "";
                        const saving = savingKey[k];
                        const ts = savedAt[k];
                        const others = otherCommentsByCell[k] || [];
                        const hasComment = value.trim().length > 0 || others.length > 0;
                        return (
                          <TableCell key={c.key} className="align-top min-w-[180px]">
                            <div className={`whitespace-pre-wrap text-sm mb-1 ${hasComment ? "font-bold text-red-600" : ""}`}>
                              {val == null || val === "" ? "—" : String(val)}
                            </div>
                            <Textarea
                              rows={1}
                              className={`text-xs min-h-[32px] ${hasComment ? "border-red-500 ring-1 ring-red-500/40 font-bold text-red-600" : ""}`}
                              value={value}
                              disabled={disabled}
                              placeholder={disabled ? "Locked" : `Comment on ${c.label.toLowerCase()}…`}
                              onChange={(e) => scheduleSave(it.id, c.key, e.target.value)}
                              onBlur={(e) => void saveNow(it.id, c.key, e.target.value)}
                            />
                            <div className="mt-0.5 text-[10px] text-muted-foreground h-3">
                              {saving ? "Saving…" : ts ? `Saved · ${new Date(ts).toLocaleTimeString()}` : ""}
                            </div>
                            {others.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {others.map((cm) => (
                                  <div key={cm.id} className="text-[10px] border-l-2 border-primary/40 pl-1.5">
                                    <div className="text-muted-foreground">
                                      <span className="font-medium text-foreground">{cm.user_name || "User"}</span>
                                      {cm.department && <span> · {cm.department}</span>}
                                    </div>
                                    <div className="whitespace-pre-wrap">{cm.comment}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    {rowOthers.length > 0 && (
                      <TableRow>
                        <TableCell />
                        <TableCell />
                        <TableCell colSpan={COLS.length} className="pt-0">
                          <div className="text-[10px] text-muted-foreground mb-1">General comments</div>
                          <div className="space-y-1">
                            {rowOthers.map((cm) => (
                              <div key={cm.id} className="text-[11px] border-l-2 border-primary/40 pl-2">
                                <div className="text-muted-foreground">
                                  <span className="font-medium text-foreground">{cm.user_name || "User"}</span>
                                  {cm.department && <span> · {cm.department}</span>}
                                </div>
                                <div className="whitespace-pre-wrap">{cm.comment}</div>
                              </div>
                            ))}
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

      {/* Sticky bottom action bar — single Post Submit + Approve (revised only) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {designApproved
              ? "Design-approved. You can still add comments or Unapprove to request another revision."
              : alreadySubmitted
                ? "Comments submitted. You can still add more comments and Post Submit again."
                : `${myDraftCount} comment${myDraftCount === 1 ? "" : "s"} ready to submit.`}
            {!designApproved && items.length > 0 && (
              <span className="ml-2">· {approvedCount} of {items.length} items approved</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePostSubmit}
              disabled={submitting || disabledSubmit(myDraftCount, alreadySubmitted, designApproved)}
            >
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Submitting…" : `Post Submit${myDraftCount ? ` (${myDraftCount})` : ""}`}
            </Button>
            {designApproved && (
              <Button
                variant="outline"
                onClick={handleUnapprove}
                disabled={unapproving}
              >
                {unapproving ? "Unapproving…" : "Unapprove"}
              </Button>
            )}
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
  void submitted;
  void approved;
  return count === 0;
}
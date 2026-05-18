import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Copy, Link2, Loader2, RefreshCw } from "lucide-react";
import {
  createReviewRound,
  fetchReviewsForBoq,
  fetchReviewItems,
  fetchReviewDocs,
  reviewLink,
  publicDocUrl,
  sendFinalBoq,
  finalBoqLink,
  snapshotRevision,
  statusLabel,
  type ReviewKind,
  type DesignReviewRow,
  type DesignReviewItemRow,
  type DesignReviewDocRow,
} from "@/lib/boq/designReview";
import type { BoqLineItem } from "@/lib/boq/types";

interface Props {
  boq: { id: string | null; user_id: string | null; boq_number: string; client_name: string | null; project_number: string | null };
  items: BoqLineItem[];
  designReviewStatus?: string | null;
  onChange?: () => void;
}

function decisionBadge(d: string) {
  if (d === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>;
  if (d === "change_required") return <Badge variant="destructive">Change Required</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function outcomeBadge(o: string | null, status: string) {
  if (status === "sent") return <Badge variant="outline">Awaiting Review</Badge>;
  if (o === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>;
  if (o === "changes_required") return <Badge variant="destructive">Changes Required</Badge>;
  if (o === "partial") return <Badge variant="secondary">Partial</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function DesignReviewPanel({ boq, items, designReviewStatus, onChange }: Props) {
  const [rounds, setRounds] = useState<DesignReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<ReviewKind | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openItems, setOpenItems] = useState<DesignReviewItemRow[]>([]);
  const [openDocs, setOpenDocs] = useState<DesignReviewDocRow[]>([]);

  async function load() {
    if (!boq.id) return;
    setLoading(true);
    try {
      const rs = await fetchReviewsForBoq(boq.id);
      setRounds(rs);
      if (rs.length && !openId) setOpenId(rs[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [boq.id]);

  useEffect(() => {
    if (!openId) { setOpenItems([]); setOpenDocs([]); return; }
    (async () => {
      const [its, dcs] = await Promise.all([fetchReviewItems(openId), fetchReviewDocs(openId)]);
      setOpenItems(its); setOpenDocs(dcs);
    })();
  }, [openId]);

  async function handleCreate(kind: ReviewKind) {
    if (!boq.id) {
      toast({ title: "Save the BOQ first", variant: "destructive" });
      return;
    }
    setCreating(kind);
    try {
      // Snapshot the current state into versions before creating a new round (only if at least one round already exists)
      if (rounds.length) {
        const latest = rounds[0];
        let revItems: DesignReviewItemRow[] = [];
        if (latest.status === "submitted") {
          try { revItems = await fetchReviewItems(latest.id); } catch { /* ignore */ }
        }
        try {
          await snapshotRevision({
            boqId: boq.id,
            lineItems: items as unknown[],
            designReviewStatus: designReviewStatus || "draft",
            reviewerOutcome: latest.overall_outcome,
            roundNo: latest.round_no,
            reviewItems: revItems as unknown[],
          });
        } catch (e) {
          console.warn("snapshotRevision failed", e);
        }
      }
      const r = await createReviewRound(boq, items, { kind });
      toast({ title: `${kind === "comment" ? "Comment" : "Approval"} link generated (R${r.round_no})` });
      const url = reviewLink(r.token);
      await navigator.clipboard.writeText(url).catch(() => {});
      await load();
      setOpenId(r.id);
      onChange?.();
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to generate link", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setCreating(null);
    }
  }

  async function handleSendFinal() {
    if (!boq.id) return;
    setFinalizing(true);
    try {
      const token = await sendFinalBoq(boq.id);
      const url = finalBoqLink(token);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: "Final BOQ link copied", description: url });
      onChange?.();
    } catch (e) {
      toast({ title: "Failed to send final BOQ", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  }

  const open = rounds.find((r) => r.id === openId) || null;
  const latest = rounds[0];
  const latestApprovalSubmitted = rounds.find((r) => r.status === "submitted" && r.kind === "approval");
  const isApproved = latestApprovalSubmitted?.overall_outcome === "approved" || designReviewStatus === "design_approved" || designReviewStatus === "final_sent";
  const needsChanges = latestApprovalSubmitted?.overall_outcome === "changes_required" || designReviewStatus === "changes_required";
  const docsByItem = openDocs.reduce<Record<string, DesignReviewDocRow[]>>((m, d) => {
    const k = d.boq_item_id || "_general";
    (m[k] ||= []).push(d); return m;
  }, {});

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Design Review</CardTitle>
          <div className="text-xs text-muted-foreground mt-1">Status: <span className="font-medium">{statusLabel(designReviewStatus)}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isApproved && designReviewStatus !== "final_sent" && (
            <Button size="sm" variant="default" onClick={handleSendFinal} disabled={finalizing || !boq.id}>
              {finalizing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Send Final BOQ to Departments
            </Button>
          )}
          {designReviewStatus === "final_sent" && (
            <Button size="sm" variant="outline" onClick={handleSendFinal} disabled={finalizing}>
              <Copy className="mr-1 h-4 w-4" />Copy Final BOQ Link
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => handleCreate("comment")} disabled={!!creating || !boq.id}>
            {creating === "comment" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
            Generate Comment Link
          </Button>
          <Button size="sm" onClick={() => handleCreate("approval")} disabled={!!creating || !boq.id}>
            {creating === "approval" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
            Generate Approval Link
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsChanges && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <div className="font-medium text-destructive">Design requires changes</div>
            <p className="mt-1 text-muted-foreground">
              Update the BOQ as per the Design comments below, then click <span className="font-medium">Generate New Review Round</span> to resend.
            </p>
          </div>
        )}
        {isApproved && designReviewStatus !== "final_sent" && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
            <div className="font-medium text-emerald-700 dark:text-emerald-400">Design Approved</div>
            <p className="mt-1 text-muted-foreground">You can now send the Final BOQ to departments.</p>
          </div>
        )}
        {designReviewStatus === "final_sent" && (
          <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-xs">
            <div className="font-medium text-primary">Final BOQ sent to departments</div>
            <p className="mt-1 text-muted-foreground">Share the copied link with downstream departments.</p>
          </div>
        )}

        {!rounds.length && (
          <p className="text-sm text-muted-foreground">
            No review rounds yet. Click <span className="font-medium">Generate Review Link</span> to create a secure, read-only review link
            you can share with the design team via WhatsApp, email, or any channel.
          </p>
        )}

        {rounds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`px-3 py-1.5 rounded-md border text-xs flex items-center gap-2 ${openId === r.id ? "bg-accent border-primary" : "bg-background hover:bg-accent/50"}`}
              >
                <span className="font-medium">Round {r.round_no}</span>
                <Badge variant="outline" className={r.kind === "approval" ? "border-indigo-500 text-indigo-700" : "border-slate-400 text-slate-600"}>
                  {r.kind === "approval" ? "Approval" : "Comment"}
                </Badge>
                {outcomeBadge(r.overall_outcome, r.status)}
              </button>
            ))}
          </div>
        )}

        {open && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Sent {new Date(open.sent_at).toLocaleString()} · Expires {new Date(open.expires_at).toLocaleDateString()}
                {open.submitted_at && <> · Submitted {new Date(open.submitted_at).toLocaleString()}</>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const url = reviewLink(open.token);
                  navigator.clipboard.writeText(url);
                  toast({ title: "Review link copied", description: url });
                }}
              >
                <Copy className="mr-1 h-4 w-4" />Copy Review Link
              </Button>
            </div>

            {open.submitted_at && (
              <div className="grid sm:grid-cols-3 gap-2 text-xs bg-muted/40 rounded p-2">
                <div><span className="text-muted-foreground">Reviewer:</span> {open.reviewer_name || "—"}</div>
                <div><span className="text-muted-foreground">Design Team:</span> {open.reviewer_design_team || "—"}</div>
                <div><span className="text-muted-foreground">Contact:</span> {open.reviewer_contact || open.submitted_by_email || "—"}</div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 w-10">#</th>
                    <th className="p-2">Model</th>
                    <th className="p-2">Description</th>
                    <th className="p-2 w-14">Qty</th>
                    <th className="p-2 w-14">Unit</th>
                    <th className="p-2">Remarks</th>
                    <th className="p-2 w-32">Status</th>
                    <th className="p-2">Review Comment</th>
                    <th className="p-2">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {openItems.map((it) => (
                    <tr key={it.id} className="border-t align-top">
                      <td className="p-2">{it.item_no}</td>
                      <td className="p-2 font-mono">{it.model_number}</td>
                      <td className="p-2">{it.description}</td>
                      <td className="p-2">{it.quantity ?? 0}</td>
                      <td className="p-2">{it.unit || "Nos"}</td>
                      <td className="p-2 text-muted-foreground">{it.remarks || <span className="opacity-50">—</span>}</td>
                      <td className="p-2">{decisionBadge(it.decision)}</td>
                      <td className="p-2 whitespace-pre-wrap">
                        {it.comment || it.design_change_note || <span className="text-muted-foreground">—</span>}
                        {it.design_change_note && it.comment && (
                          <div className="mt-1 text-[10px] text-muted-foreground">Change note: {it.design_change_note}</div>
                        )}
                      </td>
                      <td className="p-2">
                        {(docsByItem[it.boq_item_id] || []).map((d) => (
                          <a key={d.id} href={publicDocUrl(d.file_path)} target="_blank" rel="noreferrer" className="block underline truncate max-w-[160px]">
                            {d.file_name}
                          </a>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {!openItems.length && (
                    <tr><td colSpan={9} className="p-3 text-center text-muted-foreground">No items in this round.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
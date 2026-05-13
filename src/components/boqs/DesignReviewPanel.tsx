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
  type DesignReviewRow,
  type DesignReviewItemRow,
  type DesignReviewDocRow,
} from "@/lib/boq/designReview";
import type { BoqLineItem } from "@/lib/boq/types";

interface Props {
  boq: { id: string | null; user_id: string | null; boq_number: string; client_name: string | null; project_number: string | null };
  items: BoqLineItem[];
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

export function DesignReviewPanel({ boq, items }: Props) {
  const [rounds, setRounds] = useState<DesignReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
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

  async function handleCreate() {
    if (!boq.id) {
      toast({ title: "Save the BOQ first", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const r = await createReviewRound(boq, items);
      toast({ title: `Round ${r.round_no} link generated` });
      const url = reviewLink(r.token);
      await navigator.clipboard.writeText(url).catch(() => {});
      await load();
      setOpenId(r.id);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to generate link", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  const open = rounds.find((r) => r.id === openId) || null;
  const docsByItem = openDocs.reduce<Record<string, DesignReviewDocRow[]>>((m, d) => {
    const k = d.boq_item_id || "_general";
    (m[k] ||= []).push(d); return m;
  }, {});

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Design Review</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleCreate} disabled={creating || !boq.id}>
            {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
            {rounds.length ? "Generate New Review Round" : "Generate Review Link"}
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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
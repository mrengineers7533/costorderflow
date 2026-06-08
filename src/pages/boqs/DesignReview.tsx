import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import {
  fetchReviewItems,
  fetchLatestCommentBaseline,
  DIFF_FIELDS,
  type DiffField,
  type DesignReviewItemRow,
  type Decision,
  fetchCreatorAttachmentsByToken,
  signedCreatorDocUrl,
  type BoqItemAttachmentRow,
} from "@/lib/boq/designReview";
import { DocLink } from "@/components/boqs/DocLink";
import { sortByItemNo } from "@/lib/boq/types";

interface ReviewMeta {
  id: string;
  boq_id: string;
  round_no: number;
  kind: "comment" | "approval";
  status: string;
  expires_at: string;
  boq_snapshot: { boq_number?: string; client_name?: string; project_number?: string };
}

interface DocDraft { boq_item_id: string; file_name: string; file_path: string; }

type ColKey = "model" | "description" | "quantity" | "unit" | "remarks";
const COL_KEYS: ColKey[] = ["model", "description", "quantity", "unit", "remarks"];
const COL_LABEL: Record<ColKey, string> = {
  model: "Model",
  description: "Description",
  quantity: "Qty",
  unit: "Unit",
  remarks: "Remarks",
};

export default function DesignReview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ReviewMeta | null>(null);
  const [items, setItems] = useState<DesignReviewItemRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; comment: string; design_change_note: string }>>({});
  const [colComments, setColComments] = useState<Record<string, Partial<Record<ColKey, string>>>>({});
  const [docs, setDocs] = useState<DocDraft[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [baselineById, setBaselineById] = useState<Record<string, DesignReviewItemRow>>({});
  const [baselineRoundNo, setBaselineRoundNo] = useState<number | null>(null);
  const [creatorAttachments, setCreatorAttachments] = useState<Record<string, BoqItemAttachmentRow[]>>({});

  const [reviewerName, setReviewerName] = useState("");
  const [designTeam, setDesignTeam] = useState("");
  const [contact, setContact] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setError("Missing link token"); setLoading(false); return; }
      const { data, error } = await supabase
        .rpc("get_design_review_by_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setError("This review link is invalid, expired, or already submitted.");
        setLoading(false);
        return;
      }
      if (row.status !== "sent" || new Date(row.expires_at) < new Date()) {
        setError("This review link has expired or has already been submitted.");
        setMeta(row as ReviewMeta);
        setLoading(false);
        return;
      }
      setMeta(row as unknown as ReviewMeta);
      const its = await (await import("@/lib/boq/designReview")).fetchReviewItemsByToken(token);
      setItems(its);
      fetchCreatorAttachmentsByToken(token).then(setCreatorAttachments).catch(() => undefined);
      const d: typeof decisions = {};
      its.forEach((it) => { d[it.boq_item_id] = { decision: "pending", comment: "", design_change_note: "" }; });
      setDecisions(d);
      // For Approval links, load the previous Comment-round baseline so
      // Design sees a clear "Previous → Updated" comparison per item.
      if (row.kind === "approval") {
        const base = await fetchLatestCommentBaseline(row.boq_id).catch(() => null);
        if (base) {
          const map: Record<string, DesignReviewItemRow> = {};
          for (const b of base.items) map[b.boq_item_id] = b;
          setBaselineById(map);
          setBaselineRoundNo(base.round.round_no);
        }
      }
      setLoading(false);
    })();
  }, [token]);

  const counts = useMemo(() => {
    const v = Object.values(decisions);
    return {
      approved: v.filter((x) => x.decision === "approved").length,
      change: v.filter((x) => x.decision === "change_required").length,
      pending: v.filter((x) => x.decision === "pending").length,
    };
  }, [decisions]);

  function update(boqItemId: string, patch: Partial<{ decision: Decision; comment: string; design_change_note: string }>) {
    setDecisions((s) => ({ ...s, [boqItemId]: { ...s[boqItemId], ...patch } }));
  }

  function updateCol(boqItemId: string, col: ColKey, value: string) {
    setColComments((s) => ({ ...s, [boqItemId]: { ...(s[boqItemId] || {}), [col]: value } }));
  }

  function buildCommentFromCols(boqItemId: string, existing: string): string {
    const cols = colComments[boqItemId] || {};
    const parts: string[] = [];
    for (const k of COL_KEYS) {
      const v = (cols[k] || "").trim();
      if (v) parts.push(`${COL_LABEL[k]}: ${v}`);
    }
    const colText = parts.join("\n");
    if (!colText) return existing;
    return existing ? `${existing}\n${colText}` : colText;
  }

  async function uploadFile(boqItemId: string, file: File) {
    if (!meta) return;
    setUploading(boqItemId);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${meta.id}/${boqItemId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("design-review-docs").upload(path, file, { upsert: false });
      if (error) throw error;
      setDocs((s) => [...s, { boq_item_id: boqItemId, file_name: file.name, file_path: path }]);
      toast({ title: "File attached", description: file.name });
    } catch (e) {
      toast({ title: "Upload failed", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!meta || !token) return;
    if (!reviewerName.trim()) { toast({ title: "Please enter your name", variant: "destructive" }); return; }
      const isComment = meta.kind === "comment";
      if (!isComment && counts.pending > 0) {
      const ok = window.confirm(`${counts.pending} item(s) are still Pending. Submit anyway?`);
      if (!ok) return;
    }
    setSubmitting(true);
    try {
        const itemsPayload = items.map((it) => ({
        boq_item_id: it.boq_item_id,
          decision: isComment ? "pending" : decisions[it.boq_item_id].decision,
        comment: buildCommentFromCols(it.boq_item_id, decisions[it.boq_item_id].comment),
          column_comments: colComments[it.boq_item_id] || {},
          design_change_note: isComment ? "" : decisions[it.boq_item_id].design_change_note,
      }));
      const { error } = await supabase.rpc("submit_design_review_with_token", {
        _token: token,
        _reviewer_email: contact.includes("@") ? contact.trim() : "noemail@noemail.local",
        _items: itemsPayload as never,
        _docs: docs as never,
        _reviewer_name: reviewerName,
        _reviewer_design_team: designTeam,
        _reviewer_contact: contact,
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      toast({ title: "Submission failed", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md"><CardHeader><CardTitle>Review unavailable</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{error}</p></CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
            <div className="text-lg font-semibold">Review submitted successfully</div>
            <p className="text-sm text-muted-foreground">Thank you. The internal team has been notified and will action your comments.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-muted/30">
      <div className="max-w-6xl mx-auto space-y-5">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {meta?.kind === "approval" ? "Design Approval" : "Design Comments"} · Round {meta?.round_no}
                </div>
                <CardTitle className="mt-1">{meta?.boq_snapshot.boq_number}</CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {meta?.boq_snapshot.client_name} {meta?.boq_snapshot.project_number ? `· ${meta?.boq_snapshot.project_number}` : ""}
                </div>
              </div>
              {meta?.kind === "approval" ? (
                <div className="flex gap-2 text-xs">
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved {counts.approved}</Badge>
                  <Badge variant="destructive">Change {counts.change}</Badge>
                  <Badge variant="secondary">Pending {counts.pending}</Badge>
                </div>
              ) : (
                <Badge variant="outline">{items.length} items</Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Reviewer Details</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Your name" />
            </div>
            <div className="space-y-1">
              <Label>Design Team</Label>
              <Input value={designTeam} onChange={(e) => setDesignTeam(e.target.value)} placeholder="Team / company" />
            </div>
            <div className="space-y-1">
              <Label>Email or Mobile</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Optional" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">BOQ Items</CardTitle>
              {meta?.kind === "approval" && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 h-8"
                    onClick={() => {
                      setDecisions((prev) => {
                        const next: typeof prev = { ...prev };
                        for (const k of Object.keys(next)) {
                          next[k] = { ...next[k], decision: "approved" };
                        }
                        return next;
                      });
                    }}
                  >
                    Approve all items
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setDecisions((prev) => {
                        const next: typeof prev = { ...prev };
                        for (const k of Object.keys(next)) {
                          next[k] = { ...next[k], decision: "pending" };
                        }
                        return next;
                      });
                    }}
                  >
                    Reset all
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const isComment = meta?.kind === "comment";
              return (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="w-32">Model</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-20">Qty</TableHead>
                        <TableHead className="w-20">Unit</TableHead>
                        <TableHead className="w-48">Remarks</TableHead>
                        {!isComment && <TableHead className="w-40">Status</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortByItemNo(items).map((it) => {
                        const d = decisions[it.boq_item_id];
                        const cols = colComments[it.boq_item_id] || {};
                        const itemDocs = docs.filter((x) => x.boq_item_id === it.boq_item_id);
                        const base = baselineById[it.boq_item_id];
                        const wasChanged = (field: DiffField): string | null => {
                          if (isComment || !base) return null;
                          const a = base[field as keyof DesignReviewItemRow];
                          const b = (it as unknown as Record<string, unknown>)[field];
                          const sa = a == null ? "" : String(a).trim();
                          const sb = b == null ? "" : String(b).trim();
                          return sa === sb ? null : sa;
                        };
                        return (
                          <Fragment key={it.id}>
                            {!isComment && base && DIFF_FIELDS.some(({ key }) => wasChanged(key) !== null) && (
                              <TableRow className="bg-amber-50/60 dark:bg-amber-950/20 border-t-2 border-amber-500/40">
                                <TableCell className="py-1 align-top">
                                  <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">Previous{baselineRoundNo ? ` · R${baselineRoundNo}` : ""}</span>
                                </TableCell>
                                {DIFF_FIELDS.map(({ key }) => {
                                  const prev = wasChanged(key);
                                  return (
                                    <TableCell key={key} className="py-1 text-xs text-muted-foreground line-through whitespace-pre-wrap">
                                      {prev === null ? "" : (prev || "—")}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="py-1" />
                              </TableRow>
                            )}
                            <TableRow className="align-top">
                              <TableCell className="py-2 font-medium">{it.item_no}</TableCell>
                              <TableCell className="py-2 font-mono text-xs">{it.model_number}</TableCell>
                              <TableCell className="py-2 text-sm whitespace-pre-wrap">{it.description}</TableCell>
                              <TableCell className="py-2">{it.quantity ?? 0}</TableCell>
                              <TableCell className="py-2">{it.unit || "Nos"}</TableCell>
                              <TableCell className="py-2 text-xs">{it.remarks || ""}</TableCell>
                              {!isComment && (
                                <TableCell className="py-2">
                                  <div className="flex flex-col gap-1">
                                    <Button
                                      size="sm"
                                      variant={d.decision === "approved" ? "default" : "outline"}
                                      className={d.decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700 h-7" : "h-7"}
                                      onClick={() => update(it.boq_item_id, { decision: "approved" })}
                                    >Approved</Button>
                                    <Button
                                      size="sm"
                                      variant={d.decision === "change_required" ? "destructive" : "outline"}
                                      className="h-7"
                                      onClick={() => update(it.boq_item_id, { decision: "change_required" })}
                                    >Change</Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                            <TableRow key={`${it.id}-comments`} className="bg-muted/20 border-b-4 border-background">
                              <TableCell className="py-2 align-top">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Comment</span>
                                  <label className="inline-flex items-center justify-center cursor-pointer rounded border h-7 w-7 hover:bg-accent" title="Attach">
                                    {uploading === it.boq_item_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                                    <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(it.boq_item_id, f); e.target.value = ""; }} />
                                  </label>
                                </div>
                              </TableCell>
                              {COL_KEYS.map((k) => (
                                <TableCell key={k} className="py-2">
                                  <Textarea
                                    placeholder="Comment"
                                    value={cols[k] || ""}
                                    onChange={(e) => updateCol(it.boq_item_id, k, e.target.value)}
                                    className="min-h-[44px] text-xs"
                                  />
                                </TableCell>
                              ))}
                              {!isComment && (
                                <TableCell className="py-2">
                                  {d.decision === "change_required" && (
                                    <Textarea
                                      placeholder="Change note"
                                      value={d.design_change_note}
                                      onChange={(e) => update(it.boq_item_id, { design_change_note: e.target.value })}
                                      className="min-h-[44px] text-xs"
                                    />
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                            {itemDocs.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={isComment ? 6 : 7} className="py-1 text-xs">
                                  <div className="flex flex-wrap gap-2">
                                    {itemDocs.map((dc, i) => (
                                      <DocLink key={i} filePath={dc.file_path} fileName={dc.file_name} className="underline truncate max-w-[200px]" />
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
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Review
          </Button>
        </div>
      </div>
    </div>
  );
}
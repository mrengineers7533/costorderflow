import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import {
  fetchReviewItems,
  publicDocUrl,
  type DesignReviewItemRow,
  type Decision,
} from "@/lib/boq/designReview";

interface ReviewMeta {
  id: string;
  boq_id: string;
  round_no: number;
  status: string;
  expires_at: string;
  boq_snapshot: { boq_number?: string; client_name?: string; project_number?: string };
}

interface DocDraft { boq_item_id: string; file_name: string; file_path: string; }

export default function DesignReview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ReviewMeta | null>(null);
  const [items, setItems] = useState<DesignReviewItemRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { decision: Decision; comment: string; design_change_note: string }>>({});
  const [docs, setDocs] = useState<DocDraft[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const [reviewerName, setReviewerName] = useState("");
  const [designTeam, setDesignTeam] = useState("");
  const [contact, setContact] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) { setError("Missing link token"); setLoading(false); return; }
      const { data, error } = await supabase
        .from("boq_design_reviews")
        .select("id, boq_id, round_no, status, expires_at, boq_snapshot")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) {
        setError("This review link is invalid, expired, or already submitted.");
        setLoading(false);
        return;
      }
      if (data.status !== "sent" || new Date(data.expires_at) < new Date()) {
        setError("This review link has expired or has already been submitted.");
        setMeta(data as ReviewMeta);
        setLoading(false);
        return;
      }
      setMeta(data as ReviewMeta);
      const its = await fetchReviewItems(data.id);
      setItems(its);
      const d: typeof decisions = {};
      its.forEach((it) => { d[it.boq_item_id] = { decision: "pending", comment: "", design_change_note: "" }; });
      setDecisions(d);
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
    if (counts.pending > 0) {
      const ok = window.confirm(`${counts.pending} item(s) are still Pending. Submit anyway?`);
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const itemsPayload = items.map((it) => ({
        boq_item_id: it.boq_item_id,
        decision: decisions[it.boq_item_id].decision,
        comment: decisions[it.boq_item_id].comment,
        design_change_note: decisions[it.boq_item_id].design_change_note,
      }));
      const { error } = await supabase.rpc("submit_design_review_with_token", {
        _token: token,
        _reviewer_email: contact.includes("@") ? contact : (reviewerName + " <no-email>"),
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
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Design Review · Round {meta?.round_no}</div>
                <CardTitle className="mt-1">{meta?.boq_snapshot.boq_number}</CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {meta?.boq_snapshot.client_name} {meta?.boq_snapshot.project_number ? `· ${meta?.boq_snapshot.project_number}` : ""}
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved {counts.approved}</Badge>
                <Badge variant="destructive">Change {counts.change}</Badge>
                <Badge variant="secondary">Pending {counts.pending}</Badge>
              </div>
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
          <CardHeader><CardTitle className="text-base">BOQ Items (read-only)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {items.map((it) => {
              const d = decisions[it.boq_item_id];
              const itemDocs = docs.filter((x) => x.boq_item_id === it.boq_item_id);
              return (
                <div key={it.id} className="rounded-lg border p-3 grid md:grid-cols-[1fr,1fr] gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Item {it.item_no} · <span className="font-mono">{it.model_number}</span></div>
                    <div className="text-sm whitespace-pre-wrap">{it.description}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={d.decision === "approved" ? "default" : "outline"}
                        className={d.decision === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                        onClick={() => update(it.boq_item_id, { decision: "approved" })}
                      >Approved</Button>
                      <Button
                        size="sm"
                        variant={d.decision === "change_required" ? "destructive" : "outline"}
                        onClick={() => update(it.boq_item_id, { decision: "change_required" })}
                      >Change Required</Button>
                      <label className="inline-flex items-center gap-1 text-xs cursor-pointer rounded-md border px-3 py-1.5 hover:bg-accent">
                        {uploading === it.boq_item_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                        Attach
                        <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(it.boq_item_id, f); e.target.value = ""; }} />
                      </label>
                    </div>
                    <Textarea
                      placeholder="Design comment"
                      value={d.comment}
                      onChange={(e) => update(it.boq_item_id, { comment: e.target.value })}
                      className="min-h-[60px]"
                    />
                    {d.decision === "change_required" && (
                      <Textarea
                        placeholder="What design changed and what BOQ update is required?"
                        value={d.design_change_note}
                        onChange={(e) => update(it.boq_item_id, { design_change_note: e.target.value })}
                        className="min-h-[60px]"
                      />
                    )}
                    {itemDocs.length > 0 && (
                      <div className="text-xs space-y-0.5">
                        {itemDocs.map((dc, i) => (
                          <a key={i} href={publicDocUrl(dc.file_path)} target="_blank" rel="noreferrer" className="block underline truncate">
                            {dc.file_name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
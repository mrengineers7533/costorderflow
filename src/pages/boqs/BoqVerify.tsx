import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, ShieldCheck, Loader2, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sortByItemNo, type BoqLineItem, type BoqRecord } from "@/lib/boq/types";

type Decision = { status: "pending" | "approved" | "rejected"; comment: string };

export default function BoqVerify() {
  const { token = "" } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifierEmail, setVerifierEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneStatus, setDoneStatus] = useState<"approved" | "rejected" | "pending_verification" | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [showMotor, setShowMotor] = useState<boolean>(true);
  const hasMotorData = (boq?.line_items || []).some(
    (it) => (it.motor && it.motor.trim()) || (it.motor_quantity ?? 0) > 0,
  );

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .rpc("get_boq_by_verification_token", { _token: token });
      if (error || !data) {
        setError("This verification link is invalid or has already been used.");
      } else {
        const b = data as unknown as BoqRecord;
        setBoq(b);
        setShowMotor(b.show_motor !== false);
        const init: Record<string, Decision> = {};
        (b.line_items || []).forEach((it) => {
          init[it.id] = {
            status: (it.approval_status as Decision["status"]) || "pending",
            comment: it.approval_comment || "",
          };
        });
        setDecisions(init);
      }
      const { data: cfg } = await supabase
        .from("app_settings").select("value").eq("key", "boq_verifier").maybeSingle();
      const email = (cfg?.value as { email?: string } | null)?.email || "";
      if (email) setVerifierEmail(email);
      setLoading(false);
    })();
  }, [token]);

  function setDecision(id: string, patch: Partial<Decision>) {
    setDecisions((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function submit() {
    if (!boq) return;
    if (!verifierEmail.trim()) {
      toast({ title: "Enter your email to confirm", variant: "destructive" });
      return;
    }
    const items = (boq.line_items || []).map((it) => ({
      id: it.id,
      status: decisions[it.id]?.status || "pending",
      comment: decisions[it.id]?.comment || "",
    }));
    const allApproved = items.every((i) => i.status === "approved");
    const anyRejected = items.some((i) => i.status === "rejected");
    if (!allApproved && !anyRejected) {
      toast({
        title: "Decide on every item",
        description: "Approve all items to finalize, or reject at least one to send back.",
        variant: "destructive",
      });
      return;
    }
    if (anyRejected) {
      const missing = items.find((i) => i.status === "rejected" && !i.comment.trim());
      if (missing) {
        toast({ title: "Add a reason for rejected items", variant: "destructive" });
        return;
      }
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("verify_boq_items_with_token", {
      _token: token,
      _verifier_email: verifierEmail.trim(),
      _items: items,
      _show_motor: showMotor,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
      return;
    }
    const next = (data as { verification_status?: string } | null)?.verification_status as
      | "approved" | "rejected" | "pending_verification" | undefined;
    setDoneStatus(next || (allApproved ? "approved" : "rejected"));
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-6 bg-muted/20">
      <Card className="w-full max-w-3xl my-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            BOQ Senior Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : doneStatus === "approved" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <p className="font-medium">BOQ fully approved.</p>
              <p className="text-sm text-muted-foreground">All items are approved. This revision is now the active BOQ.</p>
            </div>
          ) : doneStatus === "rejected" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="font-medium">Sent back for changes.</p>
              <p className="text-sm text-muted-foreground">
                The OA creator will correct the OA. A fresh approval link is sent automatically once the OA is updated.
              </p>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : boq ? (
            <>
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{boq.boq_number}</span>
                  <Badge variant="outline" className="text-[10px]">R{boq.revision ?? 0}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">Reference OA: <span className="font-mono">{boq.reference_oa_number}</span></div>
                <div className="text-xs text-muted-foreground">{boq.line_items?.length || 0} line item(s)</div>
                <div className="text-xs text-muted-foreground">Client: {boq.client_name || "—"}</div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item-wise approval</div>
                {sortByItemNo(boq.line_items || []).map((it: BoqLineItem) => {
                  const d = decisions[it.id] || { status: "pending", comment: "" };
                  return (
                    <div key={it.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground">Item {it.item_no} · {it.model_number || "—"}</div>
                          <div className="text-sm font-medium whitespace-pre-wrap">{it.description}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Qty: {it.quantity} {it.unit}{it.remarks ? ` · Remarks: ${it.remarks}` : ""}
                          </div>
                          {showMotor && ((it.motor && it.motor.trim()) || (it.motor_quantity ?? 0) > 0) && (
                            <div className="text-[11px] text-foreground mt-0.5">
                              <span className="font-semibold uppercase tracking-wider mr-1">Motor:</span>
                              {(it.motor || "—").trim() || "—"}
                              <span className="mx-2 opacity-50">·</span>
                              <span className="font-semibold uppercase tracking-wider mr-1">Qty:</span>
                              {it.motor_quantity ?? "—"}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant={d.status === "approved" ? "default" : "outline"}
                            onClick={() => setDecision(it.id, { status: "approved" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={d.status === "rejected" ? "destructive" : "outline"}
                            onClick={() => setDecision(it.id, { status: "rejected" })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </div>
                      </div>
                      {d.status === "rejected" && (
                        <Textarea
                          value={d.comment}
                          onChange={(e) => setDecision(it.id, { comment: e.target.value })}
                          placeholder="Reason for rejection (required)"
                          rows={2}
                        />
                      )}
                      {d.status === "approved" && (
                        <Textarea
                          value={d.comment}
                          onChange={(e) => setDecision(it.id, { comment: e.target.value })}
                          placeholder="Approval comment (optional)"
                          rows={2}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="verifier-email">Your email</Label>
                <Input id="verifier-email" type="email" value={verifierEmail} onChange={(e) => setVerifierEmail(e.target.value)} placeholder="senior@company.com" />
                <p className="text-[11px] text-muted-foreground">Recorded for audit when you submit.</p>
              </div>
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="approver-show-motor" className="text-sm">Show Motor Details in BOQ</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {hasMotorData
                      ? "Toggle off to hide Motor & Motor Qty from the approved BOQ and its PDF."
                      : "No motor data on this BOQ — toggle has no effect."}
                  </p>
                </div>
                <Switch
                  id="approver-show-motor"
                  checked={showMotor}
                  onCheckedChange={setShowMotor}
                  disabled={!hasMotorData}
                />
              </div>
              <Button onClick={submit} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit decisions
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { BoqRecord } from "@/lib/boq/types";

export default function BoqVerify() {
  const { token = "" } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [boq, setBoq] = useState<BoqRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifierEmail, setVerifierEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("boqs").select("*")
        .eq("verification_token", token)
        .maybeSingle();
      if (error || !data) setError("This verification link is invalid or has already been used.");
      else setBoq(data as unknown as BoqRecord);
      // Pre-fill the configured verifier email if available.
      const { data: cfg } = await supabase
        .from("app_settings").select("value").eq("key", "boq_verifier").maybeSingle();
      const email = (cfg?.value as { email?: string } | null)?.email || "";
      if (email) setVerifierEmail(email);
      setLoading(false);
    })();
  }, [token]);

  async function handleApprove() {
    if (!verifierEmail.trim()) {
      toast({ title: "Enter your email to confirm", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("verify_boq_with_token", {
      _token: token,
      _verifier_email: verifierEmail.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
      return;
    }
    setApproved(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            BOQ Senior Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : approved ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
              <p className="font-medium">BOQ approved.</p>
              <p className="text-sm text-muted-foreground">This revision is now the active BOQ for the linked OA.</p>
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
              <div className="space-y-2">
                <Label htmlFor="verifier-email">Your email</Label>
                <Input id="verifier-email" type="email" value={verifierEmail} onChange={(e) => setVerifierEmail(e.target.value)} placeholder="senior@company.com" />
                <p className="text-[11px] text-muted-foreground">Recorded for audit when you approve this revision.</p>
              </div>
              <Button onClick={handleApprove} disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approve BOQ R{boq.revision ?? 0}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
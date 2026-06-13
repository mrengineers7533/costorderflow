import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Copy, Download, Link2, Loader2, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { BoqRecord } from "@/lib/boq/types";
import { generateBoqDistributionPDF } from "@/lib/boq/pdfDistribution";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boq: BoqRecord;
}

/** Distribute the latest approved BOQ to Purchase & Factory.
 *  - Generates a stable "family" link that always resolves to the latest approved BOQ.
 *  - Produces an enriched PDF (remarks + design comments + change log).
 *  - Logs the distribution. Optionally invokes an email-sending edge function. */
export function DistributeBoqDialog({ open, onOpenChange, boq }: Props) {
  const [purchase, setPurchase] = useState("");
  const [factory, setFactory] = useState("");
  const [message, setMessage] = useState("");
  const [familyToken, setFamilyToken] = useState<string | null>(null);
  const [orderRootId, setOrderRootId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ensuring, setEnsuring] = useState(false);
  const [showMotor, setShowMotor] = useState<boolean>(boq?.show_motor !== false);

  const hasMotorData = useMemo(
    () => (boq?.line_items || []).some((it) => (it.motor && it.motor.trim()) || (it.motor_quantity ?? 0) > 0),
    [boq?.line_items],
  );

  useEffect(() => {
    if (open) setShowMotor(boq?.show_motor !== false);
  }, [open, boq?.show_motor]);

  async function persistShowMotor(next: boolean) {
    setShowMotor(next);
    if (!boq?.id) return;
    try {
      await supabase.from("boqs").update({ show_motor: next } as never).eq("id", boq.id);
    } catch (e) {
      console.warn("persist show_motor failed", e);
    }
  }

  const familyLink = useMemo(
    () => (familyToken ? `${window.location.origin}/boq/family/${familyToken}` : ""),
    [familyToken],
  );

  // On open: resolve the order family root and ensure a share token exists.
  useEffect(() => {
    if (!open || !boq?.order_id) return;
    let cancelled = false;
    (async () => {
      setEnsuring(true);
      try {
        const { data: ord } = await supabase
          .from("orders")
          .select("id, parent_order_id")
          .eq("id", boq.order_id)
          .maybeSingle();
        const root = (ord as { parent_order_id?: string | null; id: string } | null);
        const rootId = root?.parent_order_id || root?.id || boq.order_id;
        if (cancelled) return;
        setOrderRootId(rootId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data: existing } = await sb
          .from("boq_family_share_tokens")
          .select("token")
          .eq("order_root_id", rootId)
          .maybeSingle();
        if (existing?.token) {
          if (!cancelled) setFamilyToken(existing.token);
        } else {
          const { data: ins, error } = await sb
            .from("boq_family_share_tokens")
            .insert({ order_root_id: rootId })
            .select("token")
            .single();
          if (error) throw error;
          if (!cancelled) setFamilyToken(ins.token);
        }
      } catch (e) {
        toast({ title: "Could not prepare share link", description: (e as Error).message, variant: "destructive" });
      } finally {
        if (!cancelled) setEnsuring(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, boq?.order_id]);

  function parseEmails(v: string): string[] {
    return v
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  }

  async function copyLink() {
    if (!familyLink) return;
    await navigator.clipboard.writeText(familyLink);
    toast({ title: "Link copied", description: familyLink });
  }

  async function downloadPDF() {
    if (!familyLink) return;
    setBusy(true);
    try {
      const doc = await generateBoqDistributionPDF({ ...boq, show_motor: showMotor }, familyLink, { showMotor });
      const safe = (boq.boq_number || "BOQ").replace(/[/\\]/g, "_");
      doc.save(`${safe}_R${boq.revision ?? 0}_distribution.pdf`);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!familyToken || !orderRootId) return;
    const purchaseEmails = parseEmails(purchase);
    const factoryEmails = parseEmails(factory);
    if (purchaseEmails.length === 0 && factoryEmails.length === 0) {
      toast({ title: "Add at least one recipient", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Generate PDF and upload to storage so the link can attach it for recipients.
      const doc = await generateBoqDistributionPDF({ ...boq, show_motor: showMotor }, familyLink, { showMotor });
      const blob = doc.output("blob");
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || "anon";
      const safe = (boq.boq_number || "BOQ").replace(/[/\\]/g, "_");
      const path = `${uid}/${boq.id}/distribution_R${boq.revision ?? 0}_${Date.now()}.pdf`;
      const up = await supabase.storage
        .from("boq-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (up.error) throw up.error;

      // Log the distribution (always — even if email sending isn't wired up yet).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      await sb.from("boq_distribution_log").insert({
        boq_id: boq.id,
        order_root_id: orderRootId,
        family_token: familyToken,
        revision: boq.revision ?? 0,
        purchase_emails: purchaseEmails,
        factory_emails: factoryEmails,
        message: message || null,
        sent_by: auth?.user?.id || null,
        sent_by_email: auth?.user?.email || null,
        status: "logged",
      });

      // Try to actually email via the edge function. If email isn't configured,
      // the function will return an "email_not_configured" status — we still
      // succeed because the link + PDF have been generated and logged.
      try {
        await supabase.functions.invoke("send-boq-distribution", {
          body: {
            boq_id: boq.id,
            family_link: familyLink,
            purchase_emails: purchaseEmails,
            factory_emails: factoryEmails,
            message,
            pdf_path: up.data?.path,
          },
        });
      } catch (e) {
        // non-fatal
        console.warn("email send skipped:", e);
      }

      toast({
        title: "Distribution recorded",
        description: `${purchaseEmails.length + factoryEmails.length} recipient(s). Share link copied below.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Distribution failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Distribute to Purchase & Factory</DialogTitle>
          <DialogDescription>
            Sends the latest approved BOQ (R{boq.revision ?? 0}) as PDF along with an always-latest link.
            If this BOQ is revised later, the link automatically serves the new revision.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="purchase">Purchase emails</Label>
            <Input
              id="purchase"
              placeholder="purchase@company.com, buyer@company.com"
              value={purchase}
              onChange={(e) => setPurchase(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="factory">Factory emails</Label>
            <Input
              id="factory"
              placeholder="factory@company.com"
              value={factory}
              onChange={(e) => setFactory(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg">Message (optional)</Label>
            <Textarea
              id="msg"
              rows={3}
              placeholder="Any notes for the recipients…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Link2 className="h-3.5 w-3.5" /> Always-latest BOQ link
            </div>
            {ensuring ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Preparing…</div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-[11px]">{familyLink || "—"}</code>
                <Button type="button" size="sm" variant="outline" onClick={copyLink} disabled={!familyLink}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <p className="text-muted-foreground">
              This link is stable. Whenever a newer revision is approved, the same link automatically resolves to the latest approved BOQ.
            </p>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="show-motor" className="text-sm">Show Motor Details</Label>
              <p className="text-[11px] text-muted-foreground">
                {hasMotorData
                  ? "Includes Motor & Motor Qty in the distribution PDF and on the always-latest link."
                  : "No motor data on this BOQ — toggle has no effect."}
              </p>
            </div>
            <Switch
              id="show-motor"
              checked={showMotor}
              onCheckedChange={persistShowMotor}
              disabled={!hasMotorData}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={downloadPDF} disabled={busy || !familyLink}>
            <Download className="mr-1 h-4 w-4" /> Download PDF
          </Button>
          <Button type="button" onClick={send} disabled={busy || !familyLink}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Send & log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

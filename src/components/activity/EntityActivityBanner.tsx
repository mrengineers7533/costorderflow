import { useEffect, useState } from "react";
import { AlertTriangle, Clock, CheckCircle2, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getPendingState } from "@/lib/activity/api";
import type { EntityPendingState } from "@/lib/activity/types";

/**
 * Advisory banner — never blocks any action. Reads from v_entity_pending_state.
 */
export function EntityActivityBanner({ orderRootId }: { orderRootId?: string | null }) {
  const [state, setState] = useState<EntityPendingState | null>(null);

  useEffect(() => {
    if (!orderRootId) return;
    let cancelled = false;
    getPendingState(orderRootId).then((s) => { if (!cancelled) setState(s); });
    return () => { cancelled = true; };
  }, [orderRootId]);

  if (!orderRootId || !state) return null;

  const messages: { icon: typeof Clock; title: string; desc: string; tone: "warning" | "info" | "approved" }[] = [];

  const drs = state.design_review_status;
  if (drs === "sent" || drs === "review_received") {
    messages.push({ icon: Clock, title: "Design approval pending", desc: "Approval required before final processing.", tone: "warning" });
  } else if (drs === "design_approved") {
    messages.push({ icon: CheckCircle2, title: "Design approved", desc: "Latest BOQ revision approved by design.", tone: "approved" });
  } else if (drs === "changes_required") {
    messages.push({ icon: AlertTriangle, title: "Design changes required", desc: "Reviewer requested changes on the latest BOQ.", tone: "warning" });
  }

  if (state.verification_status === "pending_verification") {
    messages.push({ icon: Clock, title: "BOQ verification pending", desc: "Awaiting approver verification.", tone: "warning" });
  }

  if (state.has_stale_requisition) {
    messages.push({ icon: Zap, title: "Requisition impacted by BOQ update", desc: `Latest BOQ revision is ${state.latest_boq_revision}. Existing requisitions reference an older revision.`, tone: "warning" });
  }

  if (!messages.length) return null;

  return (
    <div className="space-y-2 mb-3">
      {messages.map((m, i) => {
        const Icon = m.icon;
        const cls = m.tone === "approved"
          ? "border-emerald-500/40 bg-emerald-500/5"
          : m.tone === "warning"
          ? "border-amber-500/40 bg-amber-500/5"
          : "";
        return (
          <Alert key={i} className={cls}>
            <Icon className="h-4 w-4" />
            <AlertTitle className="text-sm">{m.title}</AlertTitle>
            <AlertDescription className="text-xs">{m.desc}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
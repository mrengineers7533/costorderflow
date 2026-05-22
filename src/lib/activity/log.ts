import { supabase } from "@/integrations/supabase/client";
import type { LogEventInput } from "./types";

/**
 * Fire-and-forget activity logging. Errors are swallowed (with console.warn)
 * so they can never block the calling workflow.
 */
export function logEvent(input: LogEventInput): void {
  void (async () => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("activity_events").insert({
        event_type: input.event_type,
        status: input.status ?? "info",
        module: input.module,
        title: input.title,
        message: input.message ?? null,
        order_root_id: input.order_root_id ?? null,
        order_id: input.order_id ?? null,
        boq_id: input.boq_id ?? null,
        pi_id: input.pi_id ?? null,
        requisition_id: input.requisition_id ?? null,
        actor_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_name:
          (user?.user_metadata as { full_name?: string } | undefined)?.full_name ??
          user?.email ??
          null,
        metadata: input.metadata ?? {},
      });
    } catch (err) {
      console.warn("[activity] logEvent failed", err);
    }
  })();
}
export type ActivityStatus = "info" | "pending" | "warning" | "approved" | "impacted";
export type ActivityModule =
  | "oa"
  | "boq"
  | "design"
  | "requisition"
  | "manufacturing"
  | "purchase"
  | "pi"
  | "cost_sheet";

export interface ActivityEvent {
  id: string;
  event_type: string;
  status: ActivityStatus;
  module: ActivityModule;
  title: string;
  message: string | null;
  order_root_id: string | null;
  order_id: string | null;
  boq_id: string | null;
  pi_id: string | null;
  requisition_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LogEventInput {
  event_type: string;
  status?: ActivityStatus;
  module: ActivityModule;
  title: string;
  message?: string;
  order_root_id?: string | null;
  order_id?: string | null;
  boq_id?: string | null;
  pi_id?: string | null;
  requisition_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EntityPendingState {
  order_root_id: string;
  latest_boq_id: string | null;
  latest_boq_revision: number | null;
  design_review_status: string | null;
  verification_status: string | null;
  has_stale_requisition: boolean;
}
import { supabase } from "@/integrations/supabase/client";

export type NotificationChannel = "email" | "sms" | "whatsapp" | "in_app";
export type NotificationStatus = "pending" | "queued" | "sent" | "failed" | "skipped";
// Department is free-form text in the database; common presets are listed below
// but admins may add any custom department name (e.g. "DME Team", "HR").
export type NotificationDepartment = string;
export const KNOWN_DEPARTMENTS = [
  "design",
  "purchase",
  "manufacturing",
] as const;

export interface NotificationRecipient {
  role: NotificationDepartment | "creator";
  user_id?: string | null;
  email?: string | null;
  name?: string | null;
  channels: NotificationChannel[];
}

export interface OrderRevisionNotification {
  id: string;
  order_id: string;
  order_root_id: string;
  oa_number: string;
  revision: number;
  previous_revision: number | null;
  revised_from_id: string | null;
  client_name: string | null;
  format: string | null;
  recipients: NotificationRecipient[];
  audience: Record<string, unknown>;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  channel_status: Record<string, unknown>;
  error: string | null;
  triggered_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// Cast to `any` because these tables aren't in the generated types yet.
/* eslint-disable @typescript-eslint/no-explicit-any */
const tbl = () => (supabase as any).from("order_revision_notifications");

export async function listPendingRevisionNotifications(): Promise<OrderRevisionNotification[]> {
  const { data, error } = await tbl().select("*").eq("status", "pending").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OrderRevisionNotification[];
}

export async function getRevisionNotificationsForOrder(orderId: string): Promise<OrderRevisionNotification[]> {
  const { data, error } = await tbl().select("*").eq("order_id", orderId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OrderRevisionNotification[];
}

export async function markNotificationSent(
  id: string,
  channelStatus: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await tbl().update({
    status: "sent",
    channel_status: channelStatus,
    sent_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function markNotificationFailed(id: string, errMsg: string): Promise<void> {
  const { error } = await tbl().update({ status: "failed", error: errMsg }).eq("id", id);
  if (error) throw error;
}

// Notification recipients config
export interface NotificationRecipientConfig {
  id: string;
  department: NotificationDepartment;
  user_id: string | null;
  email: string | null;
  name: string | null;
  channels: NotificationChannel[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const cfg = () => (supabase as any).from("notification_recipients");

export async function listNotificationRecipients(): Promise<NotificationRecipientConfig[]> {
  const { data, error } = await cfg().select("*").order("department").order("created_at");
  if (error) throw error;
  return (data || []) as NotificationRecipientConfig[];
}

export async function addNotificationRecipient(input: {
  department: NotificationDepartment;
  email?: string | null;
  name?: string | null;
  user_id?: string | null;
  channels?: NotificationChannel[];
}): Promise<void> {
  const { error } = await cfg().insert({
    department: input.department,
    email: input.email || null,
    name: input.name || null,
    user_id: input.user_id || null,
    channels: input.channels && input.channels.length ? input.channels : ["email"],
    is_active: true,
  });
  if (error) throw error;
}

export async function updateNotificationRecipient(
  id: string,
  patch: Partial<Pick<NotificationRecipientConfig, "is_active" | "channels" | "email" | "name" | "department">>,
): Promise<void> {
  const { error } = await cfg().update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNotificationRecipient(id: string): Promise<void> {
  const { error } = await cfg().delete().eq("id", id);
  if (error) throw error;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
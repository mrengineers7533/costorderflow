import { supabase } from "@/integrations/supabase/client";
import type { LineItem, Charges, Totals, OrderFormat, Address } from "./types";

export interface ClientCopyRecord {
  id: string;
  order_id: string;
  user_id: string | null;
  version_label: string;
  format: OrderFormat;
  file_path: string;
  file_name: string;
  line_items: LineItem[];
  charges: Charges;
  totals: Totals;
  snapshot: ClientCopySnapshot;
  created_at: string;
  // Joined fields populated client-side
  created_by_name?: string | null;
}

export interface ClientCopySnapshot {
  oa_number: string;
  company_name?: string | null;
  bill_to?: Address;
  ship_to?: Address;
  reference?: string | null;
  cost_sheet_number?: string | null;
  order_date?: string | null;
  prepared_by?: string | null;
  amount_in_words?: string | null;
  notes?: string | null;
  tc_note?: string | null;
  terms?: string | null;
  bank?: unknown;
  gmsTerms?: unknown;
}

const BUCKET = "oa-documents";

/** Fetch all Client Copy records for a list of OA revision ids. */
export async function fetchClientCopiesForOrderIds(orderIds: string[]): Promise<ClientCopyRecord[]> {
  if (!orderIds.length) return [];
  const { data, error } = await supabase
    .from("client_copies" as never)
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as ClientCopyRecord[];
}

/** Upload a PDF blob and insert a client_copies row. Returns the saved row. */
export async function saveClientCopy(args: {
  rootOrderId: string;
  orderId: string;
  format: OrderFormat;
  oaNumber: string;
  pdfBlob: Blob;
  lineItems: LineItem[];
  charges: Charges;
  totals: Totals;
  snapshot: ClientCopySnapshot;
}): Promise<ClientCopyRecord> {
  // Compute version label = number of existing copies for this OA family.
  // We look across the entire OA family (root + all revisions) so labels are stable.
  const { data: family } = await supabase
    .from("orders")
    .select("id")
    .or(`id.eq.${args.rootOrderId},parent_order_id.eq.${args.rootOrderId}`);
  const familyIds = (family || []).map((r) => (r as { id: string }).id);
  const existing = await fetchClientCopiesForOrderIds(familyIds.length ? familyIds : [args.orderId]);
  const idx = existing.length;
  const versionLabel = idx === 0 ? "Original" : `R${idx}`;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  if (!userId) throw new Error("Sign in required to save Client Copy");

  const safe = (args.oaNumber || "OA").replace(/[/\\]/g, "_");
  const fileName = `${safe}-CLIENT-COPY-${versionLabel}.pdf`;
  // Storage RLS requires the first folder to equal auth.uid().
  const filePath = `${userId}/client-copies/${args.rootOrderId}/${Date.now()}-${fileName}`;

  const up = await supabase.storage.from(BUCKET).upload(filePath, args.pdfBlob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) throw up.error;

  const insertRes = await supabase
    .from("client_copies" as never)
    .insert({
      order_id: args.orderId,
      user_id: userId,
      version_label: versionLabel,
      format: args.format,
      file_path: filePath,
      file_name: fileName,
      line_items: args.lineItems as unknown as never,
      charges: args.charges as unknown as never,
      totals: args.totals as unknown as never,
      snapshot: args.snapshot as unknown as never,
    } as never)
    .select()
    .single();
  if (insertRes.error) throw insertRes.error;
  return insertRes.data as unknown as ClientCopyRecord;
}

/** Get a temporary download URL for a stored Client Copy PDF. */
export async function getClientCopySignedUrl(filePath: string, expiresIn = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/** Download the stored PDF as a Blob (for browser-side download/print). */
export async function downloadClientCopyBlob(filePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
  if (error) throw error;
  return data;
}
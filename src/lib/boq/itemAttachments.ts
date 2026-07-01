import { supabase } from "@/integrations/supabase/client";
import type { BoqLineItem } from "@/lib/boq/types";

export interface AttachmentRow {
  id: string;
  boq_id: string;
  boq_item_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

const sig = (d?: string | null, m?: string | null) =>
  `${(d || "").trim().toLowerCase()}|${(m || "").trim().toLowerCase()}`;

/** Fetch attachments for the given BOQ's items. Also inherits attachments
 *  from ancestor BOQ revisions (walking `revised_from_id`), matching by
 *  description+model signature so files follow the item across revisions. */
export async function fetchItemAttachments(
  boqId: string | null | undefined,
  items: Pick<BoqLineItem, "id" | "description" | "model_number">[],
): Promise<Map<string, AttachmentRow[]>> {
  const result = new Map<string, AttachmentRow[]>();
  if (!boqId || !items?.length) return result;

  // Walk revision chain (bounded) to build the list of BOQ ids to search.
  const boqIds: string[] = [boqId];
  const idToItems = new Map<string, { id: string; description: string; model_number: string }[]>();
  let cursor: string | null = boqId;
  const seen = new Set<string>();
  for (let hop = 0; hop < 30 && cursor && !seen.has(cursor); hop++) {
    seen.add(cursor);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("boqs")
      .select("id, revised_from_id, line_items")
      .eq("id", cursor)
      .maybeSingle();
    if (!data) break;
    const lis = Array.isArray(data.line_items) ? data.line_items : [];
    idToItems.set(
      data.id,
      lis.map((x: BoqLineItem) => ({
        id: String(x.id || ""),
        description: x.description || "",
        model_number: x.model_number || "",
      })),
    );
    cursor = data.revised_from_id || null;
    if (cursor && !boqIds.includes(cursor)) boqIds.push(cursor);
  }

  // Load all attachment rows for the chain.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: attRows } = await (supabase as any)
    .from("boq_item_attachments")
    .select("*")
    .in("boq_id", boqIds)
    .order("created_at", { ascending: false });
  const attachments = (attRows as AttachmentRow[]) || [];
  if (!attachments.length) return result;

  // Resolve uploader names.
  const uploaderIds = Array.from(
    new Set(attachments.map((a) => a.uploaded_by).filter(Boolean)),
  ) as string[];
  const uploaderName = new Map<string, string>();
  if (uploaderIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profs } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email")
      .in("id", uploaderIds);
    for (const p of (profs as { id: string; full_name?: string; email?: string }[]) || []) {
      uploaderName.set(p.id, p.full_name || p.email || "");
    }
  }
  for (const a of attachments) {
    a.uploaded_by_name = a.uploaded_by ? uploaderName.get(a.uploaded_by) || null : null;
  }

  // Build reverse index: ancestor itemId -> current signature.
  // For each current item, collect all itemIds across the chain sharing its signature.
  const currentItemIdsBySig = new Map<string, string[]>();
  for (const it of items) {
    const s = sig(it.description, it.model_number);
    currentItemIdsBySig.set(s, [String(it.id || "")]);
  }
  // Include ancestor item IDs sharing the same signature.
  for (const [, ancItems] of idToItems) {
    for (const anc of ancItems) {
      const s = sig(anc.description, anc.model_number);
      const list = currentItemIdsBySig.get(s);
      if (list && !list.includes(anc.id) && anc.id) list.push(anc.id);
    }
  }

  // Map attachments to current items.
  for (const it of items) {
    const s = sig(it.description, it.model_number);
    const ids = new Set(currentItemIdsBySig.get(s) || []);
    const matched = attachments.filter((a) => ids.has(a.boq_item_id));
    if (matched.length) result.set(String(it.id || ""), matched);
  }
  return result;
}

export async function getAttachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("boq-item-docs")
    .createSignedUrl(path, 600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
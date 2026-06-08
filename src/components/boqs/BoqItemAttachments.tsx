import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { Loader2, Paperclip, Trash2, FileUp, Download } from "lucide-react";

export interface BoqItemAttachment {
  id: string;
  boq_id: string;
  boq_item_id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string | null;
}

const ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,text/plain,image/png,image/jpeg";

export function BoqItemAttachments({
  boqId,
  itemId,
  disabled,
}: {
  boqId: string | null;
  itemId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BoqItemAttachment[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Lightweight count fetch on mount (so the badge shows without opening).
  useEffect(() => {
    let cancelled = false;
    if (!boqId) return;
    (async () => {
      const { count: c } = await supabase
        .from("boq_item_attachments")
        .select("id", { head: true, count: "exact" })
        .eq("boq_id", boqId)
        .eq("boq_item_id", itemId);
      if (!cancelled) setCount(c || 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [boqId, itemId]);

  async function load() {
    if (!boqId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("boq_item_attachments")
      .select("*")
      .eq("boq_id", boqId)
      .eq("boq_item_id", itemId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load files", description: error.message, variant: "destructive" });
    } else {
      const list = (data || []) as unknown as BoqItemAttachment[];
      setRows(list);
      setCount(list.length);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onUpload(file: File) {
    if (!boqId) {
      toast({ title: "Save BOQ first", description: "Please save the BOQ before attaching files.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${boqId}/${itemId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("boq-item-docs").upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (up.error) throw up.error;
      const ins = await supabase.from("boq_item_attachments").insert({
        boq_id: boqId,
        boq_item_id: itemId,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: uid,
      });
      if (ins.error) throw ins.error;
      toast({ title: "File attached", description: file.name });
      await load();
    } catch (e) {
      toast({ title: "Upload failed", description: String((e as Error).message || e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function download(row: BoqItemAttachment) {
    const { data, error } = await supabase.storage
      .from("boq-item-docs")
      .createSignedUrl(row.file_path, 600);
    if (error || !data?.signedUrl) {
      toast({ title: "Cannot open file", description: error?.message || "Unknown error", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(row: BoqItemAttachment) {
    if (!window.confirm(`Remove "${row.file_name}"?`)) return;
    await supabase.storage.from("boq-item-docs").remove([row.file_path]);
    const { error } = await supabase.from("boq_item_attachments").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2 gap-1"
          disabled={disabled || !boqId}
          title={!boqId ? "Save BOQ first to attach files" : "Attach instruction file"}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {count > 0 && (
            <span className="text-[10px] rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 leading-none">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instructions for Design
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-1">No files attached.</div>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
                <span className="truncate flex-1" title={r.file_name}>{r.file_name}</span>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => download(r)} title="Download">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(r)} title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <label className={`inline-flex w-full items-center justify-center gap-2 h-9 rounded-md border border-input bg-secondary text-secondary-foreground text-sm font-medium px-3 ${uploading || !boqId ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-secondary/80"}`}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Upload file"}
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={uploading || !boqId}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-[10px] text-muted-foreground">PDF, Word, Excel, PowerPoint, CSV, TXT, PNG, JPG.</p>
      </PopoverContent>
    </Popover>
  );
}
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { AttachmentRow } from "@/lib/boq/itemAttachments";
import { getAttachmentSignedUrl } from "@/lib/boq/itemAttachments";

const fmtSize = (b: number | null | undefined) => {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleString("en-IN"); } catch { return s; }
};

export function BoqItemAttachmentsView({
  files,
  compact = true,
}: {
  files: AttachmentRow[] | undefined;
  compact?: boolean;
}) {
  const list = files || [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function openFile(row: AttachmentRow) {
    setBusy(row.id);
    const url = await getAttachmentSignedUrl(row.file_path);
    setBusy(null);
    if (!url) {
      toast({ title: "Cannot open file", description: "You may not have access.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!list.length) {
    return (
      <span className="inline-flex items-center text-muted-foreground opacity-40" title="No attachments">
        <Paperclip className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={compact ? "h-6 px-1 gap-1" : "h-8 px-2 gap-1"}
          title={`${list.length} attachment${list.length === 1 ? "" : "s"}`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span className="text-[10px] rounded-full bg-primary text-primary-foreground px-1.5 leading-4">
            {list.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Item attachments (read-only)
        </div>
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {list.map((r) => (
            <li key={r.id} className="border rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="truncate flex-1 font-medium" title={r.file_name}>{r.file_name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => openFile(r)}
                  title="View / Download"
                  disabled={busy === r.id}
                >
                  {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {(r.mime_type || "file")}{r.size_bytes ? ` · ${fmtSize(r.size_bytes)}` : ""}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {r.uploaded_by_name || "—"} · {fmtDate(r.created_at)}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Hook wrapper: fetch attachments for a BOQ + items list. */
export function useItemAttachments(
  boqId: string | null | undefined,
  items: { id: string; description?: string; model_number?: string }[] | undefined,
) {
  const [map, setMap] = useState<Map<string, AttachmentRow[]>>(new Map());
  // Callers usually build the `items` array inline (`items.map(...)`), so the
  // array identity changes on every render. Depending on it directly re-ran
  // this effect (and its unconditional setMap) on every render, causing an
  // endless render/fetch loop. Depend on a stable signature instead.
  const itemsKey = JSON.stringify(
    (items || []).map((i) => [i.id, i.description || "", i.model_number || ""]),
  );
  useEffect(() => {
    let cancelled = false;
    const list = JSON.parse(itemsKey) as [string, string, string][];
    if (!boqId || !list.length) {
      setMap((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    (async () => {
      const { fetchItemAttachments } = await import("@/lib/boq/itemAttachments");
      const m = await fetchItemAttachments(
        boqId,
        list.map(([id, description, model_number]) => ({
          id,
          description,
          model_number,
        })) as never,
      );
      if (!cancelled) setMap((prev) => (prev.size === 0 && m.size === 0 ? prev : m));
    })();
    return () => { cancelled = true; };
  }, [boqId, itemsKey]);
  return map;
}
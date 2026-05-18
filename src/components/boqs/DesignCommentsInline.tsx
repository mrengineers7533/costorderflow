import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fetchLatestSubmittedRound, publicDocUrl, type DesignReviewItemRow, type DesignReviewDocRow, type DesignReviewRow } from "@/lib/boq/designReview";

interface Props { boqId: string | null; }

export function useLatestDesignReview(boqId: string | null) {
  const [data, setData] = useState<{ round: DesignReviewRow; items: DesignReviewItemRow[]; docs: DesignReviewDocRow[] } | null>(null);
  useEffect(() => {
    if (!boqId) return;
    fetchLatestSubmittedRound(boqId).then(setData).catch(() => setData(null));
  }, [boqId]);
  return data;
}

export function DesignCommentRow({ item, docs, round }: { item: DesignReviewItemRow; docs: DesignReviewDocRow[]; round: DesignReviewRow }) {
  const badge =
    item.decision === "approved" ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge> :
    item.decision === "change_required" ? <Badge variant="destructive">Change Required</Badge> :
    <Badge variant="secondary">Pending</Badge>;
  const myDocs = docs.filter((d) => d.boq_item_id === item.boq_item_id);
  const hasContent = item.comment || item.design_change_note || myDocs.length || item.decision !== "pending";
  if (!hasContent) return null;
  return (
    <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[11px] uppercase tracking-wider text-muted-foreground">Design (R{round.round_no})</span>
        {badge}
        {round.reviewer_name && <span className="text-muted-foreground">· {round.reviewer_name}</span>}
        {round.submitted_at && <span className="text-muted-foreground">· {new Date(round.submitted_at).toLocaleDateString()}</span>}
      </div>
      {item.comment && <div className="whitespace-pre-wrap">{item.comment}</div>}
      {item.design_change_note && (
        <div className="text-muted-foreground"><span className="font-medium">Change note:</span> {item.design_change_note}</div>
      )}
      {myDocs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {myDocs.map((d) => (
            <a key={d.id} href={publicDocUrl(d.file_path)} target="_blank" rel="noreferrer" className="underline truncate max-w-[180px]">{d.file_name}</a>
          ))}
        </div>
      )}
    </div>
  );
}

export function DesignCommentsByItem({ boqId, render }: Props & { render: (itemId: string, node: React.ReactNode) => React.ReactNode }) {
  const data = useLatestDesignReview(boqId);
  if (!data) return null;
  const byId = new Map(data.items.map((it) => [it.boq_item_id, it]));
  return <>{Array.from(byId.entries()).map(([id, it]) => render(id, <DesignCommentRow item={it} docs={data.docs} round={data.round} />))}</>;
}

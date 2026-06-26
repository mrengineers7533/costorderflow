import { CheckCircle2, MessageSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DesignCellComment {
  id: string;
  boq_id: string;
  boq_item_id: string;
  column_key: string | null;
  comment: string;
  user_name: string | null;
  department: string | null;
  created_at: string;
  applied_to_oa_at: string | null;
}

export function OaCellDesignComment({
  comment,
  onApply,
  canApply = true,
  approval,
}: {
  comment: DesignCellComment | null | undefined;
  onApply: (value: string) => void;
  canApply?: boolean;
  approval?: {
    status: "approved" | "pending" | "not_approved";
    by?: string | null;
    department?: string | null;
    at?: string | null;
  } | null;
}) {
  if (!comment && (!approval || approval.status !== "approved")) return null;
  const applied = !!comment.applied_to_oa_at;
  return (
    <div className="mt-1 border-l-2 border-primary/40 pl-2 text-[11px] leading-snug">
      {comment && (
      <>
      <div className="flex items-start gap-1">
        <MessageSquare className="h-3 w-3 mt-[2px] text-primary shrink-0" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate">
                <span className="font-medium text-primary">Design:</span> {comment.comment}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-wrap">{comment.comment}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="text-muted-foreground mt-0.5 truncate">
        {comment.user_name || "User"}
        {comment.department ? ` · ${comment.department}` : ""}
        {" · "}
        {new Date(comment.created_at).toLocaleString()}
      </div>
      {applied ? (
        <div className="text-emerald-600 flex items-center gap-1 mt-0.5">
          <CheckCircle2 className="h-3 w-3" /> Applied{" "}
          {new Date(comment.applied_to_oa_at!).toLocaleDateString()}
        </div>
      ) : canApply ? (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => onApply(comment.comment)}
            className="text-primary hover:underline font-medium"
          >
            Apply
          </button>
        </div>
      ) : null}
      </>
      )}
      {approval && approval.status === "approved" && (
        <div className="text-emerald-700 flex items-center gap-1 mt-0.5">
          <CheckCircle2 className="h-3 w-3" />
          Design Approved
          {approval.by ? ` by ${approval.by}` : ""}
          {approval.department ? ` (${approval.department})` : ""}
          {approval.at ? ` · ${new Date(approval.at).toLocaleDateString()}` : ""}
        </div>
      )}
    </div>
  );
}
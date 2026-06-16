import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useUnseenNotifCount } from "@/hooks/useUnseenNotifCount";

interface Props {
  boqId?: string | null;
  orderRootId?: string | null;
  piId?: string | null;
  variant?: "inline" | "cell";
  className?: string;
}

/**
 * Read-only badge that shows the count of notifications targeting the current
 * user's department for the given BOQ/OA/PI that haven't been acknowledged
 * yet. Click jumps to the Notification Dashboard pre-filtered to that record
 * and to "unseen only". Live-updates via realtime.
 */
export function NotSeenNotifBadge({
  boqId,
  orderRootId,
  piId,
  variant = "inline",
  className = "",
}: Props) {
  const nav = useNavigate();
  const { count } = useUnseenNotifCount({ boqId, orderRootId, piId });

  function go(e: React.MouseEvent) {
    e.stopPropagation();
    const params = new URLSearchParams();
    params.set("unseen", "1");
    if (boqId) params.set("boq", boqId);
    else if (piId) params.set("pi", piId);
    else if (orderRootId) params.set("oa", orderRootId);
    nav(`/notifications?${params.toString()}`);
  }

  if (variant === "cell") {
    const tone =
      count > 0
        ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
        : "bg-muted text-muted-foreground border-border hover:bg-muted/80";
    return (
      <button
        type="button"
        onClick={go}
        title={count > 0 ? `${count} unseen notification(s)` : "No unseen notifications"}
        className={`inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full border text-xs font-semibold tabular-nums transition-colors ${tone} ${className}`}
      >
        {count}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      title="View unseen notifications for this record"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        count > 0
          ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      } ${className}`}
    >
      <Bell className="h-3.5 w-3.5" />
      <span>Not Seen Notifications:</span>
      <span className="font-bold tabular-nums">{count}</span>
    </button>
  );
}

export default NotSeenNotifBadge;
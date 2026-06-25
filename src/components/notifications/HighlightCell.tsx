import React from "react";
import { useNotifHighlight } from "@/hooks/useNotifHighlight";
import { getCellChange, isRowChanged } from "@/lib/notifications/highlight";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/**
 * Wraps a cell so that when the page is opened via a notification deep-link
 * (`?notif=…`) and this row/field is part of the change set, the cell shows
 * an amber highlight + an Old → New popover. When no change applies, the
 * children are rendered untouched (no DOM/style impact).
 */
export function HighlightCell({
  rowKey,
  field,
  children,
  className,
}: {
  rowKey: string | number | null | undefined;
  field: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { map } = useNotifHighlight();
  const change = getCellChange(map, rowKey, field);
  const rowChanged = isRowChanged(map, rowKey);
  if (!change) {
    return (
      <span
        data-notif-row={rowKey != null ? String(rowKey) : undefined}
        data-notif-field={field}
        data-notif-row-changed={rowChanged ? "1" : undefined}
        className={className}
      >
        {children}
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          data-notif-row={String(rowKey)}
          data-notif-field={field}
          data-notif-changed="1"
          className={
            "ring-2 ring-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded-sm px-0.5 cursor-help inline-block " +
            (className || "")
          }
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs">
        <div className="font-semibold mb-1">Change in this cell</div>
        <div className="grid grid-cols-[64px_1fr] gap-1">
          <span className="text-muted-foreground">Field</span>
          <span className="font-mono">{field}</span>
          <span className="text-muted-foreground">Old</span>
          <span className="line-through text-red-700">{fmt(change.before)}</span>
          <span className="text-muted-foreground">New</span>
          <span className="text-emerald-700 font-medium">{fmt(change.after)}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Banner shown at the top of a module page when opened via `?notif=…`.
 * Lists changes and provides a Jump-to-row action.
 */
export function NotifHighlightBanner() {
  const { notifId, map, loading } = useNotifHighlight();
  if (!notifId || loading || !map || map.byRow.size === 0) return null;
  return (
    <div className="mb-3 rounded-md border border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs print:hidden">
      <div className="font-medium text-amber-900 dark:text-amber-100">
        Viewing changes from notification — {map.totalRows} row(s),{" "}
        {map.totalCells} cell(s) highlighted. Hover any highlighted cell to see
        Old → New.
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {[...map.byRow.entries()].map(([rowKey, info]) => (
          <button
            key={rowKey}
            type="button"
            className="rounded border border-amber-400/60 bg-white/60 dark:bg-amber-900/20 px-2 py-0.5 hover:bg-amber-100"
            onClick={() => {
              const el = document.querySelector(
                `[data-notif-row="${CSS.escape(rowKey)}"]`,
              );
              if (el && "scrollIntoView" in el) {
                (el as HTMLElement).scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }}
          >
            Row {rowKey} · {info.fields.size} field
            {info.fields.size === 1 ? "" : "s"}
          </button>
        ))}
      </div>
    </div>
  );
}
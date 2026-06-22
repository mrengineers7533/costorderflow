import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Identifiers (names/numbers) of items to be deleted. Used for the preview list + count. */
  items: string[];
  busy?: boolean;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Strong-confirmation dialog used for bulk delete actions across folders.
 * Requires the user to type the literal word DELETE before the destructive
 * action becomes enabled.
 */
export function ConfirmBulkDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  busy,
  confirmLabel = "Delete",
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const preview = items.slice(0, 5);
  const extra = items.length - preview.length;
  const armed = typed.trim() === "DELETE" && items.length > 0 && !busy;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <div className="space-y-3 text-xs">
          <div>
            <span className="font-medium">{items.length}</span> record{items.length === 1 ? "" : "s"} will be permanently deleted.
          </div>
          {preview.length > 0 && (
            <ul className="rounded border bg-muted/40 px-3 py-2 max-h-32 overflow-auto list-disc list-inside">
              {preview.map((it, i) => (<li key={i} className="truncate">{it}</li>))}
              {extra > 0 && <li className="text-muted-foreground">+{extra} more…</li>}
            </ul>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Type <code className="px-1 bg-muted rounded">DELETE</code> to confirm</Label>
            <Input
              className="h-8"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="DELETE"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!armed}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => { e.preventDefault(); if (armed) void onConfirm(); }}
          >
            {busy ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
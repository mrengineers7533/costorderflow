import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export type DesignStatus = "pending" | "approved" | "not_approved";

export function statusBadge(s: DesignStatus) {
  if (s === "approved") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>;
  if (s === "not_approved") return <Badge variant="destructive">Not Approved</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export function DesignStatusCell({
  value, onChange, disabled,
}: { value: DesignStatus; onChange: (next: DesignStatus, reason?: string) => Promise<void> | void; disabled?: boolean }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled} className="h-7 px-2">
            {statusBadge(value)}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onChange("pending")}>Pending</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onChange("approved")}>Approve</DropdownMenuItem>
          <DropdownMenuItem onClick={() => { setReason(""); setReasonOpen(true); }}>Not Approve…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reason for Not Approved</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this item not approved?" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonOpen(false)}>Cancel</Button>
            <Button disabled={!reason.trim()} onClick={async () => { await onChange("not_approved", reason.trim()); setReasonOpen(false); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

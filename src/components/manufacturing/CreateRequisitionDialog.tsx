import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { BoqRecord } from "@/lib/boq/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boq: BoqRecord;
}

export function CreateRequisitionDialog({ open, onOpenChange, boq }: Props) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function create() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-requisition", {
        body: { boq_id: boq.id, notes: notes || undefined },
      });
      if (error) throw error;
      const reqId = (data as { requisition?: { id: string } })?.requisition?.id;
      toast({ title: "Requisition created" });
      onOpenChange(false);
      if (reqId) navigate(`/requisitions/${reqId}`);
    } catch (e) {
      toast({ title: "Could not create requisition", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Requisition</DialogTitle>
          <DialogDescription>
            Snapshots all Finish Good items from BOQ {boq.boq_number} (R{boq.revision ?? 0}).
            The requisition link will always resolve to the latest approved BOQ revision.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="req-notes">Notes (optional)</Label>
          <Textarea id="req-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={create} disabled={busy}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
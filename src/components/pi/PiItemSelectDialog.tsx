import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Receipt, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { OrderRecord } from "@/lib/orders/types";
import {
  createPiFromOaItems,
  fetchOaItemPiStatus,
  type OaItemPiStatus,
} from "@/lib/pi/convert";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oa: OrderRecord | null;
  /** Called after a PI is successfully created. */
  onCreated?: () => void;
}

export function PiItemSelectDialog({ open, onOpenChange, oa, onCreated }: Props) {
  const nav = useNavigate();
  const [statusMap, setStatusMap] = useState<Record<string, OaItemPiStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open || !oa) return;
    setSelected(new Set());
    setQtyMap({});
    setLoading(true);
    fetchOaItemPiStatus(oa.id)
      .then((m) => setStatusMap(m))
      .catch((e: any) =>
        toast({
          title: "Failed to load PI status",
          description: e?.message || String(e),
          variant: "destructive",
        }),
      )
      .finally(() => setLoading(false));
  }, [open, oa]);

  const items = oa?.line_items || [];
  function balanceFor(it: { id: string; quantity: number }) {
    const oaQty = Number(it.quantity) || 0;
    const already = statusMap[it.id]?.pi_qty || 0;
    return Math.max(0, oaQty - already);
  }
  const pendingItems = useMemo(
    () => items.filter((it) => balanceFor(it) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, statusMap],
  );
  const doneCount = items.length - pendingItems.length;

  const allPendingSelected =
    pendingItems.length > 0 && pendingItems.every((it) => selected.has(it.id));

  function toggleAllPending() {
    if (allPendingSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingItems.map((it) => it.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function piQtyFor(it: { id: string; quantity: number }) {
    const raw = qtyMap[it.id];
    if (raw === undefined || raw === "") return balanceFor(it);
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
  }
  const selectedItems = items.filter((it) => selected.has(it.id));
  const selectedTotal = selectedItems.reduce(
    (sum, it) => sum + piQtyFor(it) * (it.unit_rate || 0),
    0,
  );
  const hasInvalidQty = selectedItems.some((it) => {
    const q = piQtyFor(it);
    return !(q > 0) || q > balanceFor(it) + 1e-9;
  });

  async function handleGenerate() {
    if (!oa || selected.size === 0) return;
    setGenerating(true);
    try {
      const overrides: Record<string, number> = {};
      for (const it of selectedItems) overrides[it.id] = piQtyFor(it);
      const pi = await createPiFromOaItems(oa, Array.from(selected), overrides);
      toast({
        title: `PI ${pi.pi_number} created`,
        description: `${selectedItems.length} item(s) included.`,
      });
      onOpenChange(false);
      onCreated?.();
      nav(`/pi/${pi.id}`);
    } catch (e: any) {
      toast({
        title: "Failed to generate PI",
        description: e?.message || String(e),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Convert OA to PI — Select Items
          </DialogTitle>
          <DialogDescription>
            {oa ? (
              <span>
                OA <span className="font-mono">{oa.oa_number}</span> ·{" "}
                <span className="font-medium">{pendingItems.length}</span> pending ·{" "}
                <span className="font-medium">{doneCount}</span> already in PI
              </span>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={toggleAllPending}
                    disabled={loading || pendingItems.length === 0}
                    aria-label="Select all pending items"
                  />
                </TableHead>
                <TableHead className="w-20 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Item Code
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Description
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Qty
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Rate
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Amount
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  PI Status
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Related PI #
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />
                    Checking PI status for items…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    This OA has no line items.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it, idx) => {
                  const st = statusMap[it.id];
                  const done = !!st?.done;
                  return (
                    <TableRow
                      key={it.id}
                      className={done ? "bg-muted/20" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(it.id)}
                          onCheckedChange={() => toggleOne(it.id)}
                          disabled={done}
                          aria-label={`Select item ${idx + 1}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {it.hsn_code || `#${idx + 1}`}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate" title={it.description}>
                          {it.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.quantity} {it.unit || "Nos"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹ {(it.unit_rate || 0).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ₹ {(it.amount || 0).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        {done ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] uppercase"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            PI Done
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            Pending PI
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {st?.pi_number || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="sm:justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{selected.size}</span>{" "}
            item{selected.size === 1 ? "" : "s"} selected · Basic total{" "}
            <span className="font-medium text-foreground tabular-nums">
              ₹ {selectedTotal.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating || selected.size === 0}>
              {generating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Receipt className="mr-1.5 h-4 w-4" />
                  Generate PI ({selected.size})
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
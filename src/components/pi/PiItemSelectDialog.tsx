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
import { Receipt, Loader2, CheckCircle2, Columns3 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { OrderRecord } from "@/lib/orders/types";
import { buildClientCopyItems } from "@/lib/orders/clientCopy";
import {
  createPiFromOaItems,
  fetchOaItemPiStatus,
  type OaItemPiStatus,
} from "@/lib/pi/convert";
import { useColumnToggle } from "@/hooks/useColumnToggle";

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
  const [amtMap, setAmtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showMake, setShowMake] = useColumnToggle("pi.select.columns.make", false);

  useEffect(() => {
    if (!open || !oa) return;
    setSelected(new Set());
    setQtyMap({});
    setAmtMap({});
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

  // Always show the OA's own saved line items (source of truth). MR keeps its
  // amount-based partial-PI entry; GMS keeps the qty-based flow. The Client
  // Copy grouped layout is still applied when rendering the PI document.
  const isMR = oa?.format === "MR";
  const items = useMemo(() => oa?.line_items || [], [oa]);
  function totalAmountFor(it: { id: string; quantity: number; unit_rate: number; amount?: number }) {
    const q = Number(it.quantity) || 0;
    const r = Number(it.unit_rate) || 0;
    return Number(it.amount) || q * r;
  }
  function balanceFor(it: { id: string; quantity: number }) {
    const oaQty = Number(it.quantity) || 0;
    const already = statusMap[it.id]?.pi_qty || 0;
    return Math.max(0, oaQty - already);
  }
  function balanceAmtFor(it: { id: string; quantity: number; unit_rate: number; amount?: number }) {
    const total = totalAmountFor(it);
    const already = statusMap[it.id]?.pi_amount || 0;
    return Math.max(0, total - already);
  }
  const pendingItems = useMemo(
    () => items.filter((it) => (isMR ? balanceAmtFor(it) > 0.5 : balanceFor(it) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, statusMap, isMR],
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
  function piAmountFor(it: { id: string; quantity: number; unit_rate: number; amount?: number }) {
    const raw = amtMap[it.id];
    if (raw === undefined || raw === "") return balanceAmtFor(it);
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
  }
  function piQtyForMR(it: { id: string; quantity: number; unit_rate: number; amount?: number }) {
    const raw = qtyMap[it.id];
    if (raw === undefined || raw === "") {
      const rate = Number(it.unit_rate) || 0;
      return rate > 0 ? balanceAmtFor(it) / rate : 0;
    }
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
  }
  function setQtyMR(it: { id: string; unit_rate: number }, value: string) {
    setQtyMap((m) => ({ ...m, [it.id]: value }));
    const rate = Number(it.unit_rate) || 0;
    const n = Number(value);
    if (value === "" || isNaN(n)) {
      setAmtMap((m) => ({ ...m, [it.id]: "" }));
    } else {
      setAmtMap((m) => ({ ...m, [it.id]: String(+(n * rate).toFixed(2)) }));
    }
  }
  function setAmtMR(it: { id: string; unit_rate: number }, value: string) {
    setAmtMap((m) => ({ ...m, [it.id]: value }));
    const rate = Number(it.unit_rate) || 0;
    const n = Number(value);
    if (value === "" || isNaN(n) || rate <= 0) {
      setQtyMap((m) => ({ ...m, [it.id]: "" }));
    } else {
      setQtyMap((m) => ({ ...m, [it.id]: String(+(n / rate).toFixed(6)) }));
    }
  }
  const selectedItems = items.filter((it) => selected.has(it.id));
  const selectedTotal = selectedItems.reduce(
    (sum, it) =>
      sum + (isMR ? piAmountFor(it) : piQtyFor(it) * (it.unit_rate || 0)),
    0,
  );
  const hasInvalidQty = selectedItems.some((it) => {
    if (isMR) {
      const a = piAmountFor(it);
      return !(a > 0) || a > balanceAmtFor(it) + 1e-6;
    }
    const q = piQtyFor(it);
    return !(q > 0) || q > balanceFor(it) + 1e-9;
  });

  async function handleGenerate() {
    if (!oa || selected.size === 0) return;
    setGenerating(true);
    try {
      let pi;
      if (isMR) {
        const amtOverrides: Record<string, number> = {};
        for (const it of selectedItems) amtOverrides[it.id] = piAmountFor(it);
        pi = await createPiFromOaItems(oa, Array.from(selected), undefined, amtOverrides);
      } else {
        const overrides: Record<string, number> = {};
        for (const it of selectedItems) overrides[it.id] = piQtyFor(it);
        pi = await createPiFromOaItems(oa, Array.from(selected), overrides);
      }
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

        <div className="flex justify-end">
          <Button
            type="button"
            variant={showMake ? "secondary" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setShowMake(!showMake)}
            title="Hidden by default. Inherited from OA."
          >
            <Columns3 className="h-4 w-4" />
            {showMake ? "Hide Make column" : "Show Make column"}
          </Button>
        </div>

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
                {showMake && (
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Make
                  </TableHead>
                )}
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Qty
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  {isMR ? "Total Amount" : "Already PI Qty"}
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  {isMR ? "Already PI Amount" : "Balance Qty"}
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  {isMR ? "Balance Amount" : "PI Qty"}
                </TableHead>
                {isMR && (
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                    PI Amount
                  </TableHead>
                )}
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  Rate
                </TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground">
                  {isMR ? "PI Subtotal" : "PI Amount"}
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
                  <TableCell colSpan={(isMR ? 12 : 11) + (showMake ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />
                    Checking PI status for items…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(isMR ? 12 : 11) + (showMake ? 1 : 0)} className="text-center py-10 text-muted-foreground">
                    This OA has no line items.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it, idx) => {
                  const st = statusMap[it.id];
                  const alreadyQty = st?.pi_qty || 0;
                  const alreadyAmt = st?.pi_amount || 0;
                  const balance = balanceFor(it);
                  const totalAmt = totalAmountFor(it);
                  const balanceAmt = balanceAmtFor(it);
                  const done = isMR ? balanceAmt <= 0.5 : balance <= 0;
                  const partial = !done && (isMR ? alreadyAmt > 0 : alreadyQty > 0);
                  const overage = isMR
                    ? alreadyAmt > totalAmt + 1
                    : alreadyQty > (Number(it.quantity) || 0);
                  const isSelected = selected.has(it.id);
                  const piQty = piQtyFor(it);
                  const rate = it.unit_rate || 0;
                  const piAmount = isMR ? piAmountFor(it) : piQty * rate;
                  const invalid = isSelected && (isMR
                    ? (!(piAmount > 0) || piAmount > balanceAmt + 1e-6)
                    : (!(piQty > 0) || piQty > balance + 1e-9));
                  return (
                    <TableRow
                      key={it.id}
                      className={done ? "bg-muted/20" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
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
                      {showMake && (
                        <TableCell className="text-xs">
                          {(it as { make_label?: string }).make_label || "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">
                        {isMR ? (
                          <div className="flex items-center justify-end gap-1.5 w-32 ml-auto">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={
                                qtyMap[it.id] !== undefined
                                  ? qtyMap[it.id]
                                  : isSelected
                                  ? String(piQtyForMR(it))
                                  : ""
                              }
                              onChange={(e) => setQtyMR(it, e.target.value)}
                              disabled={done || !isSelected}
                              className={`h-8 text-right ${invalid ? "border-destructive" : ""}`}
                              placeholder={done ? "—" : String(it.quantity)}
                            />
                            <span className="text-muted-foreground text-xs">{it.unit || "Nos"}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5 w-28 ml-auto">
                            <Input
                              type="number"
                              min={0}
                              max={balance}
                              step="any"
                              value={
                                qtyMap[it.id] !== undefined
                                  ? qtyMap[it.id]
                                  : isSelected
                                  ? String(balance)
                                  : ""
                              }
                              onChange={(e) =>
                                setQtyMap((m) => ({ ...m, [it.id]: e.target.value }))
                              }
                              disabled={done || !isSelected}
                              className={`h-8 text-right ${invalid ? "border-destructive" : ""}`}
                              placeholder={done ? "—" : String(it.quantity)}
                            />
                            <span className="text-muted-foreground text-xs">{it.unit || "Nos"}</span>
                          </div>
                        )}
                      </TableCell>
                      {isMR ? (
                        <>
                          <TableCell className="text-right tabular-nums">
                            ₹ {totalAmt.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            ₹ {alreadyAmt.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₹ {balanceAmt.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums w-32">
                            <Input
                              type="number"
                              min={0}
                              max={balanceAmt}
                              step="any"
                              value={
                                amtMap[it.id] !== undefined
                                  ? amtMap[it.id]
                                  : isSelected
                                  ? String(balanceAmt)
                                  : ""
                              }
                              onChange={(e) => setAmtMR(it, e.target.value)}
                              disabled={done || !isSelected}
                              className={`h-8 text-right ${invalid ? "border-destructive" : ""}`}
                              placeholder={done ? "—" : String(balanceAmt)}
                            />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {alreadyQty}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {balance}
                          </TableCell>
                          <TableCell className="text-right tabular-nums w-28">
                            <Input
                              type="number"
                              min={0}
                              max={balance}
                              step="any"
                              value={
                                qtyMap[it.id] !== undefined
                                  ? qtyMap[it.id]
                                  : isSelected
                                  ? String(balance)
                                  : ""
                              }
                              onChange={(e) =>
                                setQtyMap((m) => ({ ...m, [it.id]: e.target.value }))
                              }
                              disabled={done || !isSelected}
                              className={`h-8 text-right ${invalid ? "border-destructive" : ""}`}
                              placeholder={done ? "—" : String(balance)}
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell className="text-right tabular-nums">
                        ₹ {rate.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ₹ {(isSelected ? piAmount : 0).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell>
                        {done ? (
                          overage ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase border-destructive text-destructive"
                              title="Already invoiced exceeds OA value. Please review."
                            >
                              Review {isMR ? `(₹${alreadyAmt.toLocaleString("en-IN")}/₹${totalAmt.toLocaleString("en-IN")})` : `(${alreadyQty}/${it.quantity})`}
                            </Badge>
                          ) : (
                          <Badge
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] uppercase"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            PI Done
                          </Badge>
                          )
                        ) : partial ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-amber-500 text-amber-700"
                          >
                            Partial {isMR ? `(₹${alreadyAmt.toLocaleString("en-IN")}/₹${totalAmt.toLocaleString("en-IN")})` : `(${alreadyQty}/${it.quantity})`}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            Pending PI
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {st?.pi_numbers?.length
                          ? st.pi_numbers.join(", ")
                          : "—"}
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
            <Button
              onClick={handleGenerate}
              disabled={generating || selected.size === 0 || hasInvalidQty}
            >
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
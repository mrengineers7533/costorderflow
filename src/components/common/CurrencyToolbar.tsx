import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { CurrencyMode } from "@/lib/currency/convert";

export interface CurrencyToolbarProps {
  mode: CurrencyMode;
  rate: number;
  onRateChange: (n: number) => void;
  /** Called with the conversion factor (multiply existing values by this).
   *  Toolbar itself does the guard + toasts and only fires when conversion
   *  is actually required. */
  onConvert: (target: CurrencyMode, factor: number) => void;
}

/** Compact INR↔USD toolbar shared by the OA and PI editors. */
export function CurrencyToolbar({ mode, rate, onRateChange, onConvert }: CurrencyToolbarProps) {
  function handle(target: CurrencyMode) {
    if (mode === target) {
      toast({
        title: target === "USD" ? "Amount is already in Dollar." : "Amount is already in INR.",
      });
      return;
    }
    if (!(rate > 0)) {
      toast({ title: "Enter a valid exchange rate", variant: "destructive" });
      return;
    }
    const factor = target === "USD" ? 1 / rate : rate;
    onConvert(target, factor);
    toast({
      title: target === "USD" ? "Converted to USD" : "Converted to INR",
      description: `Used 1 USD = ₹ ${rate}`,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Currency</span>
        <Badge variant={mode === "USD" ? "default" : "outline"} className="font-mono">
          {mode === "USD" ? "$ USD" : "₹ INR"}
        </Badge>
      </div>
      <div className="flex items-end gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">1 USD = ₹</Label>
          <Input
            type="number"
            step="0.01"
            value={rate || ""}
            onChange={(e) => onRateChange(Number(e.target.value) || 0)}
            className="h-9 w-28"
            placeholder="83.50"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-md"
          onClick={() => handle("USD")}
          title="Convert all rates and amounts from INR to USD"
        >
          <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />INR → USD
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-md"
          onClick={() => handle("INR")}
          title="Convert all rates and amounts from USD to INR"
        >
          <ArrowLeftRight className="mr-1 h-3.5 w-3.5" />USD → INR
        </Button>
      </div>
    </div>
  );
}

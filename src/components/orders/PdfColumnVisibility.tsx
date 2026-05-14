import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Columns3 } from "lucide-react";
import { PDF_COLUMN_DEFS, type PdfColumnKey } from "@/lib/orders/pdfColumns";
import type { OrderFormat } from "@/lib/orders/types";

interface Props {
  format: OrderFormat;
  hidden: PdfColumnKey[];
  onChange: (next: PdfColumnKey[]) => void;
}

/** Lets the user pick which item-table columns appear in the PDF / preview.
 *  Only affects the rendered document — underlying data is untouched. */
export function PdfColumnVisibility({ format, hidden, onChange }: Props) {
  const cols = PDF_COLUMN_DEFS.filter((d) => d.formats.includes(format));
  const hiddenCount = cols.filter((d) => !d.required && hidden.includes(d.key)).length;

  function toggle(key: PdfColumnKey, checked: boolean) {
    const set = new Set(hidden);
    if (checked) set.delete(key);
    else set.add(key);
    onChange(Array.from(set));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <Columns3 className="h-4 w-4" />
          PDF Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Choose which columns appear in the PDF / preview. Required columns
            cannot be hidden. Totals always remain visible.
          </p>
          <div className="space-y-1.5">
            {cols.map((d) => {
              const checked = d.required || !hidden.includes(d.key);
              return (
                <Label
                  key={d.key}
                  className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
                    d.required ? "opacity-60" : "cursor-pointer hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={d.required}
                    onCheckedChange={(v) => toggle(d.key, v === true)}
                  />
                  <span>{d.label}</span>
                </Label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

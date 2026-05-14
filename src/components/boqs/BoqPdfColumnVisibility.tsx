import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Columns3 } from "lucide-react";
import { BOQ_PDF_COLUMN_DEFS, type BoqPdfColumnKey } from "@/lib/boq/pdfColumns";

interface Props {
  hidden: BoqPdfColumnKey[];
  onChange: (next: BoqPdfColumnKey[]) => void;
}

/** Picks which item-table columns appear in the BOQ PDF / preview.
 *  Only affects the rendered document — saved BOQ data is untouched. */
export function BoqPdfColumnVisibility({ hidden, onChange }: Props) {
  const cols = BOQ_PDF_COLUMN_DEFS;
  const hiddenCount = cols.filter((d) => !d.required && hidden.includes(d.key)).length;

  function toggle(key: BoqPdfColumnKey, checked: boolean) {
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
            Choose which columns appear in the BOQ PDF / preview. Required
            columns cannot be hidden. Saved BOQ data is not affected.
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
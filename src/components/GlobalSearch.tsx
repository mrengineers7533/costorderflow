import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";
import {
  Search, LayoutDashboard, FileText, FilePlus2, Upload,
  FileDigit, Building2,
} from "lucide-react";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Keyboard shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Load orders once when opening (and refresh each open for freshness)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("orders")
      .select("id, oa_number, format, status, company_name, bill_to, reference, cost_sheet_number, order_date, totals")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setOrders((data as unknown as OrderRecord[]) || []);
        setLoading(false);
      });
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? orders.filter((o) => {
        const hay = [
          o.oa_number, o.company_name, o.bill_to?.name,
          o.reference, o.cost_sheet_number, o.format, o.status,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      }).slice(0, 12)
    : orders.slice(0, 6);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 rounded-lg text-muted-foreground font-normal hover:text-foreground w-full sm:w-72 justify-start px-3"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left text-sm">Search OAs, pages…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search OAs by number, company, reference… or jump to a page"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? "Loading…" : "No results found."}
          </CommandEmpty>

          <CommandGroup heading="Pages">
            <CommandItem onSelect={() => go("/")}>
              <LayoutDashboard className="mr-2 h-4 w-4" />Dashboard
            </CommandItem>
            <CommandItem onSelect={() => go("/orders")}>
              <FileText className="mr-2 h-4 w-4" />All Orders
            </CommandItem>
            <CommandItem onSelect={() => go("/orders/new")}>
              <FilePlus2 className="mr-2 h-4 w-4" />New OA
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick actions">
            <CommandItem onSelect={() => go("/orders/new")} value="upload cost sheet ai pdf">
              <Upload className="mr-2 h-4 w-4" />Upload cost sheet (AI)
            </CommandItem>
            <CommandItem onSelect={() => go("/orders/new/edit")} value="create blank manual order">
              <FilePlus2 className="mr-2 h-4 w-4" />Create blank order
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={q ? `Orders (${matches.length})` : "Recent orders"}>
            {matches.map((o) => (
              <CommandItem
                key={o.id}
                value={`${o.oa_number} ${o.company_name || ""} ${o.bill_to?.name || ""} ${o.reference || ""} ${o.format} ${o.status}`}
                onSelect={() => go(`/orders/${o.id}`)}
                className="flex items-center gap-2"
              >
                <FileDigit className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm truncate">{o.oa_number}</span>
                    <Badge
                      variant={o.format === "MR" ? "default" : "secondary"}
                      className="rounded-full px-1.5 py-0 text-[10px]"
                    >
                      {o.format}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {o.company_name || o.bill_to?.name || "—"}
                  </div>
                </div>
                <span className="hidden sm:inline text-xs font-medium tabular-nums text-muted-foreground shrink-0">
                  ₹ {(o.totals?.net_payable || 0).toLocaleString("en-IN")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

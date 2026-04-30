import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useMatch } from "react-router-dom";
import Fuse from "fuse.js";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRecord } from "@/lib/orders/types";
import {
  Search, FileDigit, Building2,
} from "lucide-react";
import { getStaticEntries, indexEntry, type CatalogEntry } from "@/lib/search/catalog";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const orderMatch = useMatch("/orders/:id");
  const currentOrderId =
    orderMatch?.params.id && orderMatch.params.id !== "new"
      ? orderMatch.params.id
      : undefined;

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
      .select("id, oa_number, format, status, company_name, bill_to, reference, cost_sheet_number, order_date, totals, line_items")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setOrders((data as unknown as OrderRecord[]) || []);
        setLoading(false);
      });
  }, [open]);

  // Build a flattened, searchable shape so Fuse can weight & match across
  // OA numbers, companies, references, AND line-item descriptions/HSN codes.
  const indexed = useMemo(
    () =>
      orders.map((o) => ({
        kind: "order" as const,
        order: o,
        oa_number: o.oa_number || "",
        company_name: o.company_name || "",
        bill_to_name: o.bill_to?.name || "",
        reference: o.reference || "",
        cost_sheet_number: o.cost_sheet_number || "",
        format: o.format || "",
        status: o.status || "",
        item_descriptions: (o.line_items || []).map((it) => it?.description || "").join(" • "),
        item_hsn: (o.line_items || []).map((it) => it?.hsn_code || "").filter(Boolean).join(" "),
      })),
    [orders],
  );

  // Static catalog of pages + app feature actions. Re-evaluated when the
  // current order context changes so order-only actions appear/disappear.
  const staticEntries = useMemo(
    () => getStaticEntries({ currentOrderId }),
    [currentOrderId],
  );
  const staticIndexed = useMemo(
    () => staticEntries.map(indexEntry),
    [staticEntries],
  );

  // Two Fuse instances — one tuned for OAs (existing weights), one for the
  // static catalog (title/keywords carry the weight).
  const fuse = useMemo(
    () =>
      new Fuse(indexed, {
        includeScore: true,
        ignoreLocation: true,   // match anywhere in the field
        // Tuned via /src/test/searchExamples.ts harness against partial OA
        // numbers, ambiguous company names, and item descriptions.
        // 0.35 keeps typo tolerance (e.g. "mahindr") while reducing noise.
        threshold: 0.35,
        minMatchCharLength: 2,
        keys: [
          { name: "oa_number",         weight: 0.30 },
          { name: "company_name",      weight: 0.22 },
          { name: "bill_to_name",      weight: 0.14 },
          { name: "reference",         weight: 0.10 },
          { name: "cost_sheet_number", weight: 0.08 },
          { name: "item_descriptions", weight: 0.10 },
          { name: "item_hsn",          weight: 0.03 },
          { name: "format",            weight: 0.015 },
          { name: "status",            weight: 0.015 },
        ],
      }),
    [indexed],
  );

  const fuseStatic = useMemo(
    () =>
      new Fuse(staticIndexed, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.4,
        minMatchCharLength: 1,
        keys: [
          { name: "title",    weight: 0.55 },
          { name: "keywords", weight: 0.35 },
          { name: "subtitle", weight: 0.10 },
        ],
      }),
    [staticIndexed],
  );

  const q = query.trim();
  const matches = useMemo(() => {
    if (!q) return orders.slice(0, 6);
    const ql = q.toLowerCase();
    const fuseHits = fuse.search(q, { limit: 20 });
    // Boost: if query is a direct substring of oa_number / cost_sheet_number,
    // those rows should outrank fuzzy company/description matches. Also
    // tiebreak by financial-year segment so the newest OA wins.
    const fyOf = (oa: string) => {
      const m = oa.match(/\/(\d{4})\//);
      return m ? parseInt(m[1], 10) : 0;
    };
    const scored = fuseHits.map((r) => {
      const it = r.item;
      let score = r.score ?? 1;
      if (it.oa_number.toLowerCase().includes(ql)) score -= 0.6;
      if (it.cost_sheet_number.toLowerCase().includes(ql)) score -= 0.4;
      if (it.reference.toLowerCase().includes(ql)) score -= 0.3;
      // Stable secondary sort: newer financial year ranks higher
      score -= fyOf(it.oa_number) * 0.0001;
      return { order: it.order, score };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 12).map((r) => r.order);
  }, [q, fuse, orders]);

  const staticMatches = useMemo<CatalogEntry[]>(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    const hits = fuseStatic.search(q, { limit: 12 });
    const scored = hits.map((r) => {
      let s = r.score ?? 1;
      if (r.item.title.toLowerCase().includes(ql)) s -= 0.4;
      if (r.item.keywords.toLowerCase().includes(ql)) s -= 0.2;
      return { entry: r.item.entry, s };
    });
    scored.sort((a, b) => a.s - b.s);
    return scored.map((r) => r.entry);
  }, [q, fuseStatic]);

  const pageMatches = staticMatches.filter((e) => e.kind === "page");
  const actionMatches = staticMatches.filter((e) => e.kind === "action");
  const defaultPages = staticEntries.filter((e) => e.kind === "page");
  const defaultActions = staticEntries.filter((e) => e.kind === "action").slice(0, 6);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const runEntry = (e: CatalogEntry) => {
    setOpen(false);
    setQuery("");
    e.run(navigate);
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
        <span className="flex-1 text-left text-sm">Search anything…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search OAs, pages, actions… (try ‘gst’, ‘turkey’, ‘upload’)"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {loading ? "Loading…" : "No results found."}
          </CommandEmpty>

          {(q ? pageMatches : defaultPages).length > 0 && (
            <CommandGroup heading="Pages">
              {(q ? pageMatches : defaultPages).map((e) => (
                <CommandItem key={e.id} value={e.id} onSelect={() => runEntry(e)}>
                  <e.icon className="mr-2 h-4 w-4 text-sky-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{e.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{e.subtitle}</div>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">Page</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(q ? actionMatches : defaultActions).length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={q ? "Actions" : "Quick actions"}>
                {(q ? actionMatches : defaultActions).map((e) => (
                  <CommandItem key={e.id} value={e.id} onSelect={() => runEntry(e)}>
                    <e.icon className="mr-2 h-4 w-4 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{e.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{e.subtitle}</div>
                    </div>
                    <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">Action</Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          <CommandGroup heading={q ? `Orders (${matches.length})` : "Recent orders"}>
            {matches.map((o) => (
              <CommandItem
                key={o.id}
                // We do our own fuzzy filtering above — give cmdk a unique
                // value so it doesn't re-filter and hide our results.
                value={o.id}
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

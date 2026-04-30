import {
  LayoutDashboard, FileText, FilePlus2, Upload, Download,
  Settings2, Banknote, ScrollText, Plus, Repeat, Globe, Ship,
  Percent, Truck, ShieldCheck, Tag, FileDigit, Filter,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavigateFunction } from "react-router-dom";

export type CatalogKind = "page" | "action";

export interface CatalogEntry {
  id: string;
  kind: CatalogKind;
  title: string;
  subtitle: string;
  keywords: string[];
  icon: LucideIcon;
  run: (nav: NavigateFunction) => void;
}

export interface CatalogContext {
  /** id of the currently-open order (when on /orders/:id), if any */
  currentOrderId?: string;
}

/** Build the static set of pages + app feature actions that the global
 *  search can match against. Order-context actions are appended only when
 *  the user is on an order route, so e.g. "Download PDF" doesn't surface
 *  on the dashboard. */
export function getStaticEntries(ctx: CatalogContext): CatalogEntry[] {
  const base: CatalogEntry[] = [
    // Pages
    {
      id: "page:dashboard", kind: "page",
      title: "Dashboard", subtitle: "Overview, drafts, recent OAs",
      keywords: ["home", "overview", "stats", "drafts", "recent"],
      icon: LayoutDashboard,
      run: (n) => n("/"),
    },
    {
      id: "page:orders", kind: "page",
      title: "All Orders", subtitle: "Browse every OA",
      keywords: ["orders", "list", "all", "oa", "history"],
      icon: FileText,
      run: (n) => n("/orders"),
    },
    {
      id: "page:new", kind: "page",
      title: "New OA", subtitle: "Choose manual or AI cost-sheet",
      keywords: ["new", "create", "add", "oa"],
      icon: FilePlus2,
      run: (n) => n("/orders/new"),
    },

    // Actions — creation
    {
      id: "action:new-manual", kind: "action",
      title: "Create blank OA (manual)",
      subtitle: "Start an empty order from scratch",
      keywords: ["manual", "blank", "empty", "create", "new", "scratch"],
      icon: FilePlus2,
      run: (n) => n("/orders/new/edit"),
    },
    {
      id: "action:new-ai", kind: "action",
      title: "Upload cost sheet (AI)",
      subtitle: "Parse a PDF cost sheet into a new OA",
      keywords: ["upload", "ai", "pdf", "parse", "extract", "cost", "sheet", "import"],
      icon: Upload,
      run: (n) => n("/orders/new"),
    },

    // Filter shortcuts on the orders list
    {
      id: "filter:drafts", kind: "action",
      title: "View drafts",
      subtitle: "Orders not yet finalized",
      keywords: ["drafts", "draft", "pending", "wip"],
      icon: Filter,
      run: (n) => n("/orders?status=draft"),
    },
    {
      id: "filter:finalized", kind: "action",
      title: "View finalized orders",
      subtitle: "Completed OAs",
      keywords: ["finalized", "final", "done", "completed"],
      icon: Filter,
      run: (n) => n("/orders?status=finalized"),
    },
    {
      id: "filter:mr", kind: "action",
      title: "View MR orders",
      subtitle: "Murthal / domestic OAs",
      keywords: ["mr", "murthal", "domestic"],
      icon: Tag,
      run: (n) => n("/orders?format=MR"),
    },
    {
      id: "filter:gms", kind: "action",
      title: "View GMS orders",
      subtitle: "Imports / Turkey / Murthal landed",
      keywords: ["gms", "import", "turkey", "landed"],
      icon: Globe,
      run: (n) => n("/orders?format=GMS"),
    },
  ];

  // Order-context shortcuts — only when an order is open.
  if (ctx.currentOrderId) {
    const oid = ctx.currentOrderId;
    const ord = (q: string) => `/orders/${oid}?${q}`;
    base.push(
      {
        id: "order:download", kind: "action",
        title: "Download PDF",
        subtitle: "Export current OA as PDF",
        keywords: ["download", "pdf", "export", "print", "save"],
        icon: Download,
        run: (n) => n(ord("action=download")),
      },
      {
        id: "order:toggle-gst", kind: "action",
        title: "Toggle GST",
        subtitle: "Enable or change GST on this OA",
        keywords: ["gst", "tax", "18", "percent"],
        icon: Percent,
        run: (n) => n(ord("focus=gst")),
      },
      {
        id: "order:toggle-freight", kind: "action",
        title: "Toggle freight",
        subtitle: "Add or remove freight charge",
        keywords: ["freight", "transport", "shipping"],
        icon: Truck,
        run: (n) => n(ord("focus=freight")),
      },
      {
        id: "order:toggle-insurance", kind: "action",
        title: "Toggle insurance",
        subtitle: "Add or remove insurance",
        keywords: ["insurance", "cover"],
        icon: ShieldCheck,
        run: (n) => n(ord("focus=insurance")),
      },
      {
        id: "order:switch-format", kind: "action",
        title: "Switch format MR ↔ GMS",
        subtitle: "Change OA format",
        keywords: ["format", "switch", "mr", "gms", "change"],
        icon: Repeat,
        run: (n) => n(ord("focus=format")),
      },
      {
        id: "order:exw-turkey", kind: "action",
        title: "GMS · EXW Turkey mode",
        subtitle: "Landed cost: sea freight, custom, GST",
        keywords: ["turkey", "exw", "import", "sea", "freight", "custom", "landed", "gms"],
        icon: Ship,
        run: (n) => n(ord("focus=gms_turkey")),
      },
      {
        id: "order:exw-murthal", kind: "action",
        title: "GMS · EXW Murthal mode",
        subtitle: "Landed cost: hike, sea freight, clearing",
        keywords: ["murthal", "exw", "landed", "gms", "hike", "clearing"],
        icon: Ship,
        run: (n) => n(ord("focus=gms_murthal")),
      },
      {
        id: "order:bank", kind: "action",
        title: "Bank details",
        subtitle: "Edit bank details on this OA",
        keywords: ["bank", "account", "ifsc", "details", "payment"],
        icon: Banknote,
        run: (n) => n(ord("focus=bank")),
      },
      {
        id: "order:terms", kind: "action",
        title: "Terms & conditions",
        subtitle: "Edit T&C on this OA",
        keywords: ["terms", "conditions", "t&c", "tc", "warranty"],
        icon: ScrollText,
        run: (n) => n(ord("focus=terms")),
      },
      {
        id: "order:add-line", kind: "action",
        title: "Add line item",
        subtitle: "Append a new row",
        keywords: ["add", "line", "item", "row", "append"],
        icon: Plus,
        run: (n) => n(ord("focus=add_item")),
      },
      {
        id: "order:settings", kind: "action",
        title: "Open OA settings",
        subtitle: "Charges, P&F, discount",
        keywords: ["settings", "charges", "pf", "p&f", "discount"],
        icon: Settings2,
        run: (n) => n(ord("focus=charges")),
      },
      {
        id: "order:cs", kind: "action",
        title: "Edit cost sheet number",
        subtitle: "Reference field on the OA",
        keywords: ["cost", "sheet", "number", "cs", "reference"],
        icon: FileDigit,
        run: (n) => n(ord("focus=cost_sheet")),
      },
    );
  }

  return base;
}

/** Flatten an entry into a Fuse-friendly indexed shape. */
export function indexEntry(e: CatalogEntry) {
  return {
    kind: "static" as const,
    entry: e,
    title: e.title,
    subtitle: e.subtitle,
    keywords: e.keywords.join(" "),
    group: e.kind,
  };
}
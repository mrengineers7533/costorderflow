export type ModuleKey =
  | "dashboard"
  | "orders"
  | "boqs"
  | "pi"
  | "workflow"
  | "purchase"
  | "manufacturing"
  | "requisitions"
  | "raw_materials"
  | "grn"
  | "reports"
  | "cost_sheets";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders / Costing" },
  { key: "boqs", label: "BOQs" },
  { key: "pi", label: "Proforma Invoices" },
  { key: "workflow", label: "Workflow" },
  { key: "purchase", label: "Purchase" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "requisitions", label: "Requisitions" },
  { key: "raw_materials", label: "Raw Materials" },
  { key: "grn", label: "GRN" },
  { key: "reports", label: "Flow Report" },
  { key: "cost_sheets", label: "Cost Sheets" },
];
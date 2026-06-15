export type ModuleKey =
  | "dashboard"
  | "costing"
  | "workflow"
  | "purchase"
  | "manufacturing"
  | "requisitions"
  | "annexures"
  | "raw_materials"
  | "grn"
  | "reports"
  | "cost_sheets"
  | "design"
  | "notifications";

export const MODULES: { key: ModuleKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "costing", label: "Costing (Orders / BOQ / PI)" },
  { key: "design", label: "Design (BOQ View & Comments)" },
  { key: "notifications", label: "Notification Dashboard" },
  { key: "workflow", label: "Workflow" },
  { key: "purchase", label: "Purchase" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "requisitions", label: "Requisitions" },
  { key: "annexures", label: "Annexure Folder" },
  { key: "raw_materials", label: "Raw Materials" },
  { key: "grn", label: "GRN" },
  { key: "reports", label: "Flow Report" },
  { key: "cost_sheets", label: "Cost Sheets" },
];
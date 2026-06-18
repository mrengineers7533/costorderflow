export type DocKind = "order" | "boq" | "pi" | "purchase_order" | "requisition";
export type DocPerm = "view" | "edit";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  order: "Order (OA)",
  boq: "BOQ",
  pi: "Proforma Invoice",
  purchase_order: "Purchase Order",
  requisition: "Requisition",
};
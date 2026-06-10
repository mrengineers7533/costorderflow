import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, Layers, ShoppingCart, FileText } from "lucide-react";

const cards = [
  {
    to: "/purchase/boq-folder",
    title: "BOQ Folder",
    desc: "MR BOQ and GMS BOQ — approved BOQs filtered by order format.",
    icon: FolderOpen,
  },
  {
    to: "/purchase/approved",
    title: "Approved BOQs",
    desc: "All approved BOQs ready for the existing purchase workflow.",
    icon: Layers,
  },
  {
    to: "/purchase/materials",
    title: "Purchase Material",
    desc: "Lot-wise annexure-created raw materials. Create vendor POs.",
    icon: ShoppingCart,
  },
  {
    to: "/purchase/po-folder",
    title: "PO Folder",
    desc: "All generated Purchase Orders. Download, send, cancel.",
    icon: FileText,
  },
];

export default function PurchaseLanding() {
  return (
    <div className="container mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Purchase</h1>
        <p className="text-xs text-muted-foreground">
          Choose a folder to continue. Existing flows are unchanged.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to} className="block">
              <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="py-6 flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 text-primary p-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">{c.title}</div>
                    <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
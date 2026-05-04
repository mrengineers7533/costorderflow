import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";
import { inferItemMake } from "@/lib/orders/calc";
import type { OrderFormat } from "@/lib/orders/types";

export default function NewOrderChooser() {
  const navigate = useNavigate();
  const [extracted, setExtracted] = useState<ExtractedCostSheet | null>(null);

  function handleExtracted(data: ExtractedCostSheet, _sheet: unknown, forcedFormat?: OrderFormat) {
    // If the user clicked the per-sheet "Create MR/GMS OA" button, skip the
    // in-page chooser and go straight to the editor with the chosen format.
    if (forcedFormat) {
      navigate("/orders/new/edit", { state: { extracted: data, forcedFormat } });
      return;
    }
    // Otherwise (Apply / first parse), let the user pick MR or GMS below.
    // The same cost sheet stays available for the other format later.
    setExtracted(data);
  }

  function startOA(forcedFormat: OrderFormat) {
    navigate("/orders/new/edit", { state: { extracted, forcedFormat } });
  }

  const counts = (() => {
    if (!extracted?.line_items?.length) return { mr: 0, gms: 0, other: 0 };
    let mr = 0, gms = 0, other = 0;
    for (const it of extracted.line_items) {
      const make = (it as { make?: "MR" | "GMS" | "OTHER" }).make || inferItemMake(it);
      if (make === "MR") mr++;
      else if (make === "GMS") gms++;
      else other++;
    }
    return { mr, gms, other };
  })();

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="rounded-lg">
            <ArrowLeft className="mr-1 h-4 w-4" />Orders
          </Button>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Upload Cost Sheet</h1>
          <p className="text-sm text-muted-foreground">
            Drop a cost sheet PDF — we'll extract company, items and charges. Then choose
            which company this OA is for. The cost sheet stays available so you can create
            the other one later.
          </p>
        </div>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-5">
            <CostSheetPicker onApply={handleExtracted} />
          </CardContent>
        </Card>

        {extracted && (
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Choose company for this OA</h2>
                <p className="text-sm text-muted-foreground">
                  Detected: <span className="font-medium text-foreground">{counts.mr}</span> MR item{counts.mr === 1 ? "" : "s"},{" "}
                  <span className="font-medium text-foreground">{counts.gms}</span> GMS item{counts.gms === 1 ? "" : "s"}
                  {counts.other ? <> · <span className="font-medium text-foreground">{counts.other}</span> unclassified (added to MR)</> : null}.
                  You can create the other format from the same cost sheet anytime.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto justify-start gap-3 py-4 rounded-lg"
                  onClick={() => startOA("MR")}
                >
                  <Building2 className="h-5 w-5 text-primary shrink-0" />
                  <span className="flex-1 text-left">
                    <span className="block font-semibold">Create MR OA</span>
                    <span className="block text-xs text-muted-foreground">MR Engineers · {counts.mr + counts.other} item{(counts.mr + counts.other) === 1 ? "" : "s"}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="outline"
                  className="h-auto justify-start gap-3 py-4 rounded-lg"
                  onClick={() => startOA("GMS")}
                >
                  <Factory className="h-5 w-5 text-primary shrink-0" />
                  <span className="flex-1 text-left">
                    <span className="block font-semibold">Create GMS OA</span>
                    <span className="block text-xs text-muted-foreground">GMS · {counts.gms} item{counts.gms === 1 ? "" : "s"}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

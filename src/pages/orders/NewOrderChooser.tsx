import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";

export default function NewOrderChooser() {
  const navigate = useNavigate();

  function handleExtracted(data: ExtractedCostSheet) {
    navigate("/orders/new/edit", { state: { extracted: data } });
  }

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
            Drop a cost sheet PDF — we'll extract company, items and charges and pre-fill the OA editor for you.
          </p>
        </div>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-5">
            <CostSheetPicker onApply={handleExtracted} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

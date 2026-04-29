import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, FilePlus2, Upload, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CostSheetPicker, type ExtractedCostSheet } from "@/components/orders/CostSheetPicker";

export default function NewOrderChooser() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [parsing, setParsing] = useState(false);

  function handleExtracted(data: ExtractedCostSheet) {
    navigate("/orders/new/edit", { state: { extracted: data } });
  }

  return (
    <div className="min-h-screen p-6 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} className="rounded-lg">
            <ArrowLeft className="mr-1 h-4 w-4" />Orders
          </Button>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Create New Order Acceptance</h1>
          <p className="text-sm text-muted-foreground">
            Start from a cost sheet PDF and let AI fill the form, or build the OA from scratch.
          </p>
        </div>

        {!showUpload ? (
          <div className="grid gap-5 md:grid-cols-2">
            <ChoiceCard
              icon={<Upload className="h-6 w-6" />}
              badge={<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium"><Sparkles className="h-3 w-3" />AI Powered</span>}
              title="Upload Cost Sheet"
              description="Drop a cost sheet PDF — we'll extract company, items, charges and pre-fill the OA for you."
              ctaLabel="Upload PDF"
              onClick={() => setShowUpload(true)}
            />
            <ChoiceCard
              icon={<FilePlus2 className="h-6 w-6" />}
              title="Create Blank Manually"
              description="Start with an empty form and enter all order details by hand."
              ctaLabel="Start blank"
              to="/orders/new/edit"
            />
          </div>
        ) : (
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Upload Cost Sheet</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We'll parse the PDF and open the editor with everything pre-filled.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowUpload(false)} disabled={parsing}>
                  Back
                </Button>
              </div>
              <CostSheetPicker onApply={handleExtracted} onParsingChange={setParsing} />
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/orders/new/edit">Skip — start blank<ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ChoiceCard({
  icon, title, description, ctaLabel, to, onClick, badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  to?: string;
  onClick?: () => void;
  badge?: React.ReactNode;
}) {
  const inner = (
    <Card className="group h-full rounded-xl border-border/70 shadow-sm transition-all hover:border-primary/40 hover:shadow-md cursor-pointer">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          {badge}
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
        <div className="pt-2">
          <span className="inline-flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all gap-1">
            {ctaLabel}<ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return <button type="button" onClick={onClick} className="block h-full text-left w-full">{inner}</button>;
}

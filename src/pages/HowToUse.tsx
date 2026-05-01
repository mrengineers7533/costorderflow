import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  MousePointerClick,
  Pencil,
  Eye,
  Save,
} from "lucide-react";
import { CreatorCredit } from "@/components/CreatorCredit";

const steps = [
  {
    n: 1,
    title: "Open the dashboard",
    desc: "Start from the Dashboard to see an overview of your work and quick links to every section.",
    icon: LayoutDashboard,
  },
  {
    n: 2,
    title: "Choose the feature you want to use",
    desc: "Pick a section from the sidebar — Orders, BOQs, or Proforma Invoices — depending on what you want to do.",
    icon: MousePointerClick,
  },
  {
    n: 3,
    title: "Enter the required details",
    desc: "Fill in the form fields. Required information is highlighted so you know exactly what to provide.",
    icon: Pencil,
  },
  {
    n: 4,
    title: "Review the result",
    desc: "Use the live preview to verify your data, totals, and formatting before finalizing anything.",
    icon: Eye,
  },
  {
    n: 5,
    title: "Save, export, or continue as needed",
    desc: "Save your work, download a PDF, or move on to the next step in your workflow.",
    icon: Save,
  },
];

export default function HowToUse() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          How to use this app
        </h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          A quick step-by-step guide to get the most out of every feature.
          Follow the steps below in order, or jump straight into the section
          you need.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.n} className="rounded-xl">
            <CardContent className="flex gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
                {s.n}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold leading-tight">
                    {s.title}
                  </h2>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CreatorCredit variant="page" />
    </div>
  );
}
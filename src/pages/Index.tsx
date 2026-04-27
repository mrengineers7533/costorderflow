import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FilePlus2, LayoutTemplate } from "lucide-react";
import { QuickOrderPanel } from "@/components/orders/QuickOrderPanel";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="font-semibold">Order Acceptance</Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/orders">Orders</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/orders/templates">Templates</Link></Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight">Generate MR & GMS Order Acceptances</h1>
          <p className="mt-3 text-muted-foreground">
            Upload a cost sheet PDF — AI extracts items, charges and addresses. Review, finalize and download a fully-formatted order PDF.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild><Link to="/orders/new"><FilePlus2 className="h-4 w-4 mr-1" />New order</Link></Button>
            <Button variant="outline" asChild><Link to="/orders"><FileText className="h-4 w-4 mr-1" />View orders</Link></Button>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-3">
            <h2 className="text-xl font-semibold tracking-tight">Try it now</h2>
            <p className="text-sm text-muted-foreground">Upload a cost sheet PDF and watch the order preview fill in as AI extracts the data.</p>
          </div>
          <QuickOrderPanel />
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <FeatureCard icon={<FilePlus2 className="h-5 w-5" />} title="New order" desc="Start from a cost sheet — AI fills the form." to="/orders/new" />
          <FeatureCard icon={<FileText className="h-5 w-5" />} title="Orders" desc="Browse drafts and finalized OAs." to="/orders" />
          <FeatureCard icon={<LayoutTemplate className="h-5 w-5" />} title="Templates" desc="Manage MR/GMS PDF templates (admin)." to="/orders/templates" />
        </section>
      </main>
    </div>
  );
};

function FeatureCard({ icon, title, desc, to }: { icon: React.ReactNode; title: string; desc: string; to: string }) {
  return (
    <Link to={to}>
      <Card className="h-full transition-colors hover:bg-accent">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{desc}</CardContent>
      </Card>
    </Link>
  );
}

export default Index;

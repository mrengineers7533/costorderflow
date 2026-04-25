import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FilePlus2, LayoutTemplate, LogIn } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="font-semibold">Order Acceptance</Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/orders">Orders</Link></Button>
            <Button variant="ghost" size="sm" asChild><Link to="/orders/templates">Templates</Link></Button>
            {authed ? (
              <Button size="sm" variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth"); }}>Sign out</Button>
            ) : (
              <Button size="sm" asChild><Link to="/auth"><LogIn className="h-4 w-4 mr-1" />Sign in</Link></Button>
            )}
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

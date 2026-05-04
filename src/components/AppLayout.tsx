import type { User } from "@supabase/supabase-js";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";

const PAGE_META: Record<string, { title: string; desc?: string }> = {
  "/": { title: "Dashboard", desc: "Overview across Order Acceptances, BOQs, and Proforma Invoices." },
  "/orders": { title: "Order Acceptances", desc: "Manage and review all OAs." },
  "/boqs": { title: "BOQs", desc: "Bill of Quantities across OAs and revisions." },
  "/pi": { title: "Proforma Invoices", desc: "Manage PIs and revisions." },
};

export function AppLayout({ children, user }: { children: React.ReactNode; user: User }) {
  const location = useLocation();
  const meta =
    PAGE_META[location.pathname] ||
    (location.pathname.startsWith("/orders") ? { title: "Order Acceptances" } :
     location.pathname.startsWith("/boqs") ? { title: "BOQs" } :
     location.pathname.startsWith("/pi") ? { title: "Proforma Invoices" } :
     { title: "" });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 flex items-center gap-3 border-b bg-background sticky top-0 z-40 px-4 py-2">
            {meta.title && (
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight leading-tight truncate">{meta.title}</h1>
                {meta.desc && (
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">{meta.desc}</p>
                )}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />
              <span className="hidden md:inline text-xs text-muted-foreground max-w-[180px] truncate">{user.email}</span>
              <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Sign out</Button>
            </div>
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

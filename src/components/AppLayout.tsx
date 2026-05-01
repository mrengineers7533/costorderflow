import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useLocation } from "react-router-dom";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const HeaderActionsContext = createContext<{
  setActions: (node: ReactNode | null) => void;
}>({ setActions: () => {} });

export function useHeaderActions(node: ReactNode, deps: unknown[] = []) {
  const { setActions } = useContext(HeaderActionsContext);
  useEffect(() => {
    setActions(node);
    return () => setActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const PAGE_META: Record<string, { title: string; desc?: string }> = {
  "/": { title: "Dashboard", desc: "Overview across Order Acceptances, BOQs, and Proforma Invoices." },
  "/orders": { title: "Order Acceptances", desc: "Manage and review all OAs." },
  "/boqs": { title: "BOQs", desc: "Bill of Quantities across OAs and revisions." },
  "/pi": { title: "Proforma Invoices", desc: "Manage PIs and revisions." },
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [actions, setActions] = useState<ReactNode | null>(null);
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
              {actions}
              <GlobalSearch />
            </div>
          </header>
          <main className="flex-1 min-w-0">
            <HeaderActionsContext.Provider value={{ setActions }}>
              {children}
            </HeaderActionsContext.Provider>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

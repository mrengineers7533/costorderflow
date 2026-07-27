import type { User } from "@supabase/supabase-js";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ActivityBell } from "@/components/activity/ActivityBell";
import { GlobalNotificationsBell } from "@/components/notifications/GlobalNotificationsBell";
import { UserMenu } from "@/components/UserMenu";
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
        <AppSidebar user={user} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="min-h-14 flex items-center gap-3 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 px-5 py-2 shadow-soft">
            {meta.title && (
              <div className="min-w-0">
                <h1 className="text-[15px] font-semibold tracking-tight leading-tight truncate font-display">{meta.title}</h1>
                {meta.desc && (
                  <p className="text-[11px] text-muted-foreground leading-tight truncate mt-0.5">{meta.desc}</p>
                )}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />
              <GlobalNotificationsBell />
              <ActivityBell />
              <UserMenu user={user} />
            </div>
          </header>
          <main className="flex-1 min-w-0 max-w-full overflow-x-clip bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

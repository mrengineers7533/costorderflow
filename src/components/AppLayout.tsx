import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-background/90 backdrop-blur sticky top-0 z-40 px-3">
            <SidebarTrigger />
            <div className="h-6 w-px bg-border" />
            <span className="hidden md:inline text-sm font-medium text-muted-foreground">Workspace</span>
            <div className="ml-auto flex items-center gap-2">
              <GlobalSearch />
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Live
              </span>
            </div>
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

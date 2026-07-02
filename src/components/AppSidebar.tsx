import { LayoutGrid, FileText, Menu, ClipboardList, Receipt, ChevronLeft, ChevronRight, BarChart3, Workflow, ShoppingCart, Factory, ClipboardCheck, Boxes, PackageCheck, FileSpreadsheet, PencilRuler, Bell, ChevronDown, IndianRupee } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useState, useEffect } from "react";
import { useUserAccess } from "@/hooks/useUserAccess";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import type { ModuleKey } from "@/lib/access/modules";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const reportItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Dashboard",              url: "/",              icon: LayoutGrid, module: "dashboard" },
  { title: "Notification Dashboard", url: "/notifications", icon: Bell,      module: "notifications" },
  { title: "Flow Report",            url: "/reports",       icon: BarChart3, module: "reports" },
  { title: "Work Flow",              url: "/workflow",      icon: Workflow,  module: "workflow" },
];

const midItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Cost Sheet", url: "/cost-sheets", icon: FileSpreadsheet, module: "cost_sheets" },
];

const costingItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Orders",            url: "/orders", icon: FileText,       module: "costing" },
  { title: "BOQ",               url: "/boqs",   icon: ClipboardList,  module: "costing" },
  { title: "Proforma Invoices", url: "/pi",     icon: Receipt,        module: "costing" },
];

const bottomItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Design",              url: "/design",                 icon: PencilRuler,    module: "design" },
  { title: "Manufacturing",       url: "/manufacturing",          icon: Factory,        module: "manufacturing" },
  { title: "Requisition",         url: "/requisitions",           icon: ClipboardCheck, module: "requisitions" },
  { title: "Annexure Folder",     url: "/requisitions/annexures", icon: FileText,       module: "annexures" },
  { title: "Purchase",            url: "/purchase",               icon: ShoppingCart,   module: "purchase" },
  { title: "GRN",                 url: "/grn",                    icon: PackageCheck,   module: "grn" },
  { title: "Raw Material Master", url: "/raw-materials",          icon: Boxes,          module: "raw_materials" },
];

export function AppSidebar({ user }: { user?: User | null }) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isAdmin, canAccess } = useUserAccess(user?.id);
  const unread = useUnreadNotifications(user?.id);

  const visibleReport = reportItems.filter((it) =>
    it.module === "dashboard" ? true : isAdmin || canAccess(it.module),
  );
  const visibleMid = midItems.filter((it) =>
    isAdmin || canAccess(it.module),
  );
  const visibleCosting = costingItems.filter((it) =>
    isAdmin || canAccess(it.module),
  );
  const visibleBottom = bottomItems.filter((it) =>
    isAdmin || canAccess(it.module),
  );

  const isCostingActive = visibleCosting.some(
    (it) => pathname === it.url || pathname.startsWith(it.url + "/"),
  );
  const [costingOpen, setCostingOpen] = useState(isCostingActive);

  useEffect(() => {
    if (isCostingActive) setCostingOpen(true);
  }, [isCostingActive]);

  const isReportActive = visibleReport.some((it) =>
    it.url === "/" ? pathname === "/" : pathname === it.url || pathname.startsWith(it.url + "/"),
  );
  const [reportOpen, setReportOpen] = useState(true);

  useEffect(() => {
    if (isReportActive) setReportOpen(true);
  }, [isReportActive]);

  const MenuItem = ({
    item,
    indent = false,
  }: {
    item: (typeof reportItems)[number];
    indent?: boolean;
  }) => {
    const active =
      item.url === "/"
        ? pathname === "/"
        : pathname === item.url || pathname.startsWith(item.url + "/");
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          isActive={active}
          className={`h-11 rounded-full transition-colors duration-200 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground ${collapsed ? "!w-11 !h-11 !p-2 justify-center px-0 mx-auto" : `px-4 ${indent ? "pl-8" : ""}`}`}
        >
          <NavLink
            to={item.url}
            end={item.url === "/"}
            className={
              active
                ? `font-semibold ${collapsed ? "justify-center" : ""}`
                : `text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary ${collapsed ? "justify-center" : ""}`
            }
          >
            <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.8} />
            {!collapsed && <span className="text-sm">{item.title}</span>}
            {item.module === "notifications" && unread > 0 && (
              collapsed ? (
                <span
                  aria-label={`${unread} unread notifications`}
                  className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-sidebar"
                />
              ) : (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                  {unread > 99 ? "99+" : unread}
                </span>
              )
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar gap-0">
        <div className={`flex items-center gap-3 h-14 border-b border-sidebar-border/60 ${collapsed ? "justify-center px-3" : "px-5"}`}>
          <button
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="h-9 w-9 flex items-center justify-center rounded-full text-sidebar-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors duration-200"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight font-display text-sidebar-foreground">
              Cost Order Flow
            </span>
          )}
        </div>

        <SidebarGroup className="px-3 pt-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {visibleReport.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <button
                      onClick={() => setReportOpen((o) => !o)}
                      className={`peer/menu-button flex items-center gap-2 overflow-hidden rounded-full text-left text-sm outline-none ring-sidebar-ring transition-colors duration-200 hover:bg-primary/10 hover:text-primary h-11 ${collapsed ? "w-11 justify-center px-0 mx-auto" : "w-full px-4 justify-between"} ${isReportActive ? "bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground font-semibold" : "text-sidebar-foreground/70"}`}
                    >
                      <span className="flex items-center gap-2">
                        <BarChart3 className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        {!collapsed && <span className="text-sm">Report & Dashboard</span>}
                      </span>
                      {!collapsed && (
                        <span>
                          {reportOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </button>
                  </SidebarMenuItem>

                  {(reportOpen || collapsed) &&
                    visibleReport.map((item) => (
                      <MenuItem key={item.title} item={item} indent={!collapsed} />
                    ))}
                </>
              )}

              {visibleMid.map((item) => (
                <MenuItem key={item.title} item={item} />
              ))}

              {visibleCosting.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <button
                      onClick={() => setCostingOpen((o) => !o)}
                      className={`peer/menu-button flex items-center gap-2 overflow-hidden rounded-full text-left text-sm outline-none ring-sidebar-ring transition-colors duration-200 hover:bg-primary/10 hover:text-primary h-11 ${collapsed ? "w-11 justify-center px-0 mx-auto" : "w-full px-4 justify-between"} ${isCostingActive ? "bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground font-semibold" : "text-sidebar-foreground/70"}`}
                    >
                      <span className="flex items-center gap-2">
                        <IndianRupee className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        {!collapsed && <span className="text-sm">Costing</span>}
                      </span>
                      {!collapsed && (
                        <span>
                          {costingOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </span>
                      )}
                    </button>
                  </SidebarMenuItem>

                  {(costingOpen || collapsed) &&
                    visibleCosting.map((item) => (
                      <MenuItem
                        key={item.title}
                        item={item}
                        indent={!collapsed}
                      />
                    ))}
                </>
              )}

              {visibleBottom.map((item) => (
                <MenuItem key={item.title} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar p-3 pt-2 border-t border-sidebar-border/60">
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`h-11 rounded-full transition-colors duration-200 text-sidebar-foreground/70 hover:bg-primary/10 hover:text-primary ${collapsed ? "w-11 justify-center px-0 mx-auto" : "px-4"}`}
            >
              {collapsed ? (
                <ChevronRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
              ) : (
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
              )}
              {!collapsed && <span className="text-sm">Collapse</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

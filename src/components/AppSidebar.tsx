import { LayoutGrid, FileText, Menu, ClipboardList, Receipt, ChevronLeft, ChevronRight, BarChart3, Workflow, ShoppingCart, Factory, ClipboardCheck, Boxes, PackageCheck, FileSpreadsheet, PencilRuler, Bell, ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useState } from "react";
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

const topItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Dashboard", url: "/", icon: LayoutGrid, module: "dashboard" },
];

const costingItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Orders",            url: "/orders", icon: FileText,       module: "orders" },
  { title: "BOQs",              url: "/boqs",   icon: ClipboardList,  module: "boqs" },
  { title: "Proforma Invoices", url: "/pi",     icon: Receipt,        module: "pi" },
];

const bottomItems: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Design",          url: "/design",             icon: PencilRuler,    module: "design" },
  { title: "Notifications",   url: "/notifications",      icon: Bell,           module: "notifications" },
  { title: "Workflow",        url: "/workflow",           icon: Workflow,       module: "workflow" },
  { title: "Purchase",        url: "/purchase",           icon: ShoppingCart,   module: "purchase" },
  { title: "Manufacturing",   url: "/manufacturing",      icon: Factory,        module: "manufacturing" },
  { title: "Requisitions",    url: "/requisitions",       icon: ClipboardCheck, module: "requisitions" },
  { title: "Annexure Folder", url: "/requisitions/annexures", icon: FileText, module: "requisitions" },
  { title: "Raw Material Master", url: "/raw-materials", icon: Boxes,          module: "raw_materials" },
  { title: "GRN",             url: "/grn",                icon: PackageCheck,     module: "grn" },
  { title: "Flow Report",     url: "/reports",            icon: BarChart3,        module: "reports" },
  { title: "Cost Sheets",     url: "/cost-sheets",        icon: FileSpreadsheet,  module: "cost_sheets" },
];

export function AppSidebar({ user }: { user?: User | null }) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isAdmin, canAccess } = useUserAccess(user?.id);
  const unread = useUnreadNotifications(user?.id);

  const visibleTop = topItems.filter((it) =>
    it.module === "dashboard" ? true : isAdmin || canAccess(it.module),
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

  const MenuItem = ({
    item,
    indent = false,
  }: {
    item: (typeof topItems)[number];
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
          className={`h-11 rounded-full px-4 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground ${indent ? "pl-8" : ""}`}
        >
          <NavLink
            to={item.url}
            end={item.url === "/"}
            className={
              active
                ? "font-semibold"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }
          >
            <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.8} />
            {!collapsed && <span className="text-sm">{item.title}</span>}
            {item.module === "notifications" && unread > 0 && (
              <span className={`ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold ${collapsed ? "absolute top-1 right-1" : ""}`}>
                {unread > 99 ? "99+" : unread}
              </span>
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
            className="text-sidebar-foreground/80 hover:text-sidebar-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-sidebar-foreground">
              MR&nbsp;Engineers
            </span>
          )}
        </div>

        <SidebarGroup className="px-3 pt-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {visibleTop.map((item) => (
                <MenuItem key={item.title} item={item} />
              ))}

              {visibleCosting.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <button
                      onClick={() => setCostingOpen((o) => !o)}
                      className={`peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-11 rounded-full px-4 ${collapsed ? "" : "justify-between"} ${isCostingActive ? "bg-primary text-primary-foreground shadow-md hover:bg-primary hover:text-primary-foreground font-semibold" : "text-sidebar-foreground/70"}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-[18px]">
                          <span className="text-[10px] font-bold">₹</span>
                        </span>
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
              className="h-11 rounded-full px-4 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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

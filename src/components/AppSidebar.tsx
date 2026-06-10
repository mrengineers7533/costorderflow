import { LayoutGrid, FileText, Menu, ClipboardList, Receipt, ChevronLeft, ChevronRight, ShieldCheck, LogOut, BarChart3, Workflow, ShoppingCart, Factory, ClipboardCheck, Boxes } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserAccess } from "@/hooks/useUserAccess";
import type { ModuleKey } from "@/lib/access/modules";
import { useProfileName } from "@/hooks/useProfileName";
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

const items: { title: string; url: string; icon: typeof LayoutGrid; module: ModuleKey }[] = [
  { title: "Dashboard", url: "/", icon: LayoutGrid, module: "dashboard" },
  { title: "Orders",    url: "/orders",     icon: FileText, module: "orders" },
  { title: "BOQs",      url: "/boqs",       icon: ClipboardList, module: "boqs" },
  { title: "Proforma Invoices", url: "/pi", icon: Receipt, module: "pi" },
  { title: "Workflow",  url: "/workflow",   icon: Workflow, module: "workflow" },
  { title: "Purchase",  url: "/purchase",   icon: ShoppingCart, module: "purchase" },
  { title: "Manufacturing", url: "/manufacturing", icon: Factory, module: "manufacturing" },
  { title: "Requisitions", url: "/requisitions", icon: ClipboardCheck, module: "requisitions" },
  { title: "Annexure Folder", url: "/requisitions/annexures", icon: FileText, module: "requisitions" },
  { title: "Raw Material Master", url: "/raw-materials", icon: Boxes, module: "raw_materials" },
  { title: "Flow Report", url: "/reports", icon: BarChart3, module: "reports" },
];

export function AppSidebar({ user }: { user?: User | null }) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isAdmin } = useUserRole(user?.id);
  const { canAccess } = useUserAccess(user?.id);
  const visibleItems = items.filter((it) =>
    it.module === "dashboard" ? true : isAdmin || canAccess(it.module),
  );
  const displayName = useProfileName(user ?? null);
  const initials = (displayName || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "?";

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Card-like sidebar inspired by reference: white surface, soft shadow,
          hamburger + brand header, big rounded pill for active item. */}
      <SidebarContent className="bg-sidebar gap-0">
        {/* Brand header — aligned with top app header */}
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

        {/* Main nav */}
        <SidebarGroup className="px-3 pt-4">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {visibleItems.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-11 rounded-full px-4 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
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
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer group, separated by a thin divider — matches reference */}
      <SidebarFooter className="bg-sidebar p-3 pt-2 border-t border-sidebar-border/60">
        {/* User card */}
        {user && (
          <div className={`mb-2 rounded-xl bg-sidebar-accent/40 ${collapsed ? "p-2 flex justify-center" : "p-3 flex items-center gap-3"}`}>
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="text-sm font-semibold text-sidebar-foreground truncate">{displayName || "User"}</div>
                <div className="text-[11px] text-sidebar-foreground/60 truncate">{user.email}</div>
              </div>
            )}
          </div>
        )}

        <SidebarMenu className="gap-1.5">
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/admin")}
                className="h-11 rounded-full px-4 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
              >
                <NavLink
                  to="/admin"
                  className={
                    pathname.startsWith("/admin")
                      ? "font-semibold"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }
                >
                  <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  {!collapsed && <span className="text-sm">Admin Panel</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => supabase.auth.signOut()}
                className="h-11 rounded-full px-4 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
                {!collapsed && <span className="text-sm">Sign out</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>

        {/* Collapse / expand toggle at the very bottom */}
        <SidebarMenu className="gap-1.5 mt-1">
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

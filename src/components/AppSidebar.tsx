import { LayoutGrid, FileText, Settings, Menu, ClipboardList, Receipt, HelpCircle } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
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

const items = [
  { title: "Dashboard", url: "/", icon: LayoutGrid },
  { title: "Orders",    url: "/orders",     icon: FileText },
  { title: "BOQs",      url: "/boqs",       icon: ClipboardList },
  { title: "Proforma Invoices", url: "/pi", icon: Receipt },
];

const footerItems = [
  { title: "How to use?", url: "/how-to-use", icon: HelpCircle },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

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
              {items.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="h-11 rounded-xl px-3 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-md data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
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
        <SidebarMenu className="gap-1.5">
          {footerItems.map((item) => {
            const active = pathname === item.url || pathname.startsWith(item.url + "/");
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="h-11 rounded-xl px-3 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                >
                  <NavLink
                    to={item.url}
                    className={
                      active
                        ? "font-semibold"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    }
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                    {!collapsed && <span className="text-sm">{item.title}</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

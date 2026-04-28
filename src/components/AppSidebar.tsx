import { Home, FileText, FilePlus2 } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import appLogo from "@/assets/app-logo.png";

const items = [
  { title: "Home", url: "/", icon: Home },
  { title: "Orders", url: "/orders", icon: FileText },
  { title: "New OA", url: "/orders/new", icon: FilePlus2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent className="bg-sidebar">
        <div className={`flex items-center ${collapsed ? "justify-center px-2" : "px-4"} h-16 border-b border-sidebar-border`}>
          <img
            src={appLogo}
            alt="GMS | MR Engineers"
            className={collapsed ? "h-8 w-8 object-contain" : "h-10 w-auto object-contain"}
          />
        </div>
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pt-3">
              Main
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active} className="h-10 rounded-lg">
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={
                          active
                            ? "relative bg-primary/10 text-primary font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-r-full before:bg-primary"
                            : "text-sidebar-foreground/80 hover:bg-muted/60 hover:text-sidebar-foreground"
                        }
                      >
                        <item.icon className={`h-[18px] w-[18px] ${active ? "text-primary" : "text-muted-foreground"}`} />
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
    </Sidebar>
  );
}

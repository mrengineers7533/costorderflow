import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ResetPassword from "./pages/ResetPassword";
import OrdersList from "./pages/orders/OrdersList";
import OrderEditor from "./pages/orders/OrderEditor";
import NewOrderChooser from "./pages/orders/NewOrderChooser";
import BoqList from "./pages/boqs/BoqList";
import BoqEditor from "./pages/boqs/BoqEditor";
import PiList from "./pages/pi/PiList";
import PiEditor from "./pages/pi/PiEditor";
import FlowReport from "./pages/reports/FlowReport";
import { AppLayout } from "./components/AppLayout";
import { AuthGate } from "./components/AuthGate";
import { RequireAdmin } from "./components/RequireAdmin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminDomains from "./pages/admin/AdminDomains";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/*"
            element={
              <AuthGate>
                {(user) => (
                  <AppLayout user={user}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/orders" element={<OrdersList />} />
                      <Route path="/orders/new" element={<NewOrderChooser />} />
                      <Route path="/orders/new/edit" element={<OrderEditor />} />
                      <Route path="/orders/:id" element={<OrderEditor />} />
                      <Route path="/boqs" element={<BoqList />} />
                      <Route path="/boqs/new" element={<BoqEditor />} />
                      <Route path="/boqs/:id" element={<BoqEditor />} />
                      <Route path="/pi" element={<PiList />} />
                      <Route path="/pi/:id" element={<PiEditor />} />
                      <Route path="/reports" element={<FlowReport />} />
                      <Route
                        path="/admin"
                        element={<RequireAdmin user={user}><AdminDashboard /></RequireAdmin>}
                      />
                      <Route
                        path="/admin/users"
                        element={<RequireAdmin user={user}><AdminUsers /></RequireAdmin>}
                      />
                      <Route
                        path="/admin/domains"
                        element={<RequireAdmin user={user}><AdminDomains /></RequireAdmin>}
                      />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                )}
              </AuthGate>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

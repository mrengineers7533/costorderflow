import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import OrdersList from "./pages/orders/OrdersList";
import OrderEditor from "./pages/orders/OrderEditor";
import NewOrderChooser from "./pages/orders/NewOrderChooser";
import BoqList from "./pages/boqs/BoqList";
import BoqEditor from "./pages/boqs/BoqEditor";
import PiList from "./pages/pi/PiList";
import PiEditor from "./pages/pi/PiEditor";
import HowToUse from "./pages/HowToUse";
import { AppLayout } from "./components/AppLayout";
import AuthPage from "./pages/auth/AuthPage";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/admin/AdminDashboard";
import UsersManagement from "./pages/admin/UsersManagement";
import { AuthProvider } from "./hooks/useAuth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AdminRoute } from "./components/auth/AdminRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected app */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
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
                      <Route path="/how-to-use" element={<HowToUse />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route
                        path="/admin"
                        element={
                          <AdminRoute>
                            <AdminDashboard />
                          </AdminRoute>
                        }
                      />
                      <Route
                        path="/admin/users"
                        element={
                          <AdminRoute>
                            <UsersManagement />
                          </AdminRoute>
                        }
                      />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

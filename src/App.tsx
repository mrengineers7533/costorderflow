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
import WorkflowPage from "./pages/workflow/WorkflowPage";
import PurchaseList from "./pages/purchase/PurchaseList";
import PurchaseDetail from "./pages/purchase/PurchaseDetail";
import ManufacturingList from "./pages/manufacturing/ManufacturingList";
import ManufacturingDetail from "./pages/manufacturing/ManufacturingDetail";
import RequisitionsList from "./pages/requisitions/RequisitionsList";
import RequisitionDetail from "./pages/requisitions/RequisitionDetail";
import PublicRequisition from "./pages/requisitions/PublicRequisition";
import { AppLayout } from "./components/AppLayout";
import { AuthGate } from "./components/AuthGate";
import { RequireAdmin } from "./components/RequireAdmin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminDomains from "./pages/admin/AdminDomains";
import AdminBoqSettings from "./pages/admin/AdminBoqSettings";
import AdminRawMaterials from "./pages/admin/AdminRawMaterials";
import BoqVerify from "./pages/boqs/BoqVerify";
import DesignReview from "./pages/boqs/DesignReview";
import FinalBoq from "./pages/boqs/FinalBoq";
import FamilyBoq from "./pages/boqs/FamilyBoq";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/boq-verify/:token" element={<BoqVerify />} />
          <Route path="/design-review/:token" element={<DesignReview />} />
          <Route path="/boq/final/:token" element={<FinalBoq />} />
          <Route path="/boq/family/:token" element={<FamilyBoq />} />
          <Route path="/requisition/:token" element={<PublicRequisition />} />
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
                      <Route path="/workflow" element={<WorkflowPage />} />
                      <Route path="/purchase" element={<PurchaseList />} />
                      <Route path="/purchase/:boqId" element={<PurchaseDetail />} />
                      <Route path="/manufacturing" element={<ManufacturingList />} />
                      <Route path="/manufacturing/:boqId" element={<ManufacturingDetail />} />
                      <Route path="/requisitions" element={<RequisitionsList />} />
                      <Route path="/requisitions/:id" element={<RequisitionDetail />} />
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
                      <Route
                        path="/admin/boq-verification"
                        element={<RequireAdmin user={user}><AdminBoqSettings /></RequireAdmin>}
                      />
                      <Route
                        path="/admin/raw-materials"
                        element={<RequireAdmin user={user}><AdminRawMaterials /></RequireAdmin>}
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

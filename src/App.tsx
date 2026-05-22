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
import RawMaterialMaster from "./pages/RawMaterialMaster";
import { AppLayout } from "./components/AppLayout";
import { AuthGate } from "./components/AuthGate";
import { RequireAdmin } from "./components/RequireAdmin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminDomains from "./pages/admin/AdminDomains";
import AdminBoqSettings from "./pages/admin/AdminBoqSettings";
import AdminRawMaterials from "./pages/admin/AdminRawMaterials";
import AdminNotificationRecipients from "./pages/admin/AdminNotificationRecipients";
import AdminAccess from "./pages/admin/AdminAccess";
import BoqVerify from "./pages/boqs/BoqVerify";
import DesignReview from "./pages/boqs/DesignReview";
import FinalBoq from "./pages/boqs/FinalBoq";
import FamilyBoq from "./pages/boqs/FamilyBoq";
import { RequireModule } from "./components/RequireModule";

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
                      <Route path="/orders" element={<RequireModule user={user} module="orders"><OrdersList /></RequireModule>} />
                      <Route path="/orders/new" element={<RequireModule user={user} module="orders"><NewOrderChooser /></RequireModule>} />
                      <Route path="/orders/new/edit" element={<RequireModule user={user} module="orders"><OrderEditor /></RequireModule>} />
                      <Route path="/orders/:id" element={<RequireModule user={user} module="orders"><OrderEditor /></RequireModule>} />
                      <Route path="/boqs" element={<RequireModule user={user} module="boqs"><BoqList /></RequireModule>} />
                      <Route path="/boqs/new" element={<RequireModule user={user} module="boqs"><BoqEditor /></RequireModule>} />
                      <Route path="/boqs/:id" element={<RequireModule user={user} module="boqs"><BoqEditor /></RequireModule>} />
                      <Route path="/pi" element={<RequireModule user={user} module="pi"><PiList /></RequireModule>} />
                      <Route path="/pi/:id" element={<RequireModule user={user} module="pi"><PiEditor /></RequireModule>} />
                      <Route path="/reports" element={<RequireModule user={user} module="reports"><FlowReport /></RequireModule>} />
                      <Route path="/workflow" element={<RequireModule user={user} module="workflow"><WorkflowPage /></RequireModule>} />
                      <Route path="/purchase" element={<RequireModule user={user} module="purchase"><PurchaseList /></RequireModule>} />
                      <Route path="/purchase/:boqId" element={<RequireModule user={user} module="purchase"><PurchaseDetail /></RequireModule>} />
                      <Route path="/manufacturing" element={<RequireModule user={user} module="manufacturing"><ManufacturingList /></RequireModule>} />
                      <Route path="/manufacturing/:boqId" element={<RequireModule user={user} module="manufacturing"><ManufacturingDetail /></RequireModule>} />
                      <Route path="/requisitions" element={<RequireModule user={user} module="requisitions"><RequisitionsList /></RequireModule>} />
                      <Route path="/requisitions/:id" element={<RequireModule user={user} module="requisitions"><RequisitionDetail /></RequireModule>} />
                      <Route path="/raw-materials" element={<RequireModule user={user} module="raw_materials"><RawMaterialMaster /></RequireModule>} />
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
                      <Route
                        path="/admin/notifications"
                        element={<RequireAdmin user={user}><AdminNotificationRecipients /></RequireAdmin>}
                      />
                      <Route
                        path="/admin/access"
                        element={<RequireAdmin user={user}><AdminAccess /></RequireAdmin>}
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

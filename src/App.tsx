import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InvoiceDetailPage } from "./pages/InvoiceDetailPage";
import { SellersPage } from "./pages/SellersPage";
import { WebhooksPage } from "./pages/WebhooksPage";
import { CouponsOverviewPage } from "./pages/CouponsOverviewPage";
import { CouponsPage } from "./pages/CouponsPage";
import { CouponDetailPage } from "./pages/CouponDetailPage";
import { RedemptionsPage } from "./pages/RedemptionsPage";
import { PlansPricesPage } from "./pages/PlansPricesPage";
import { AffiliatesPage } from "./pages/AffiliatesPage";
import { BusinessesPage } from "./pages/BusinessesPage";
import { CommissionsPage } from "./pages/CommissionsPage";
import { BusinessPanelPage } from "./pages/BusinessPanelPage";
import { AffiliatePanelPage } from "./pages/AffiliatePanelPage";
import type { BoRole } from "./types";

/** Rota admin-only (default). */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

/** Rota liberada pros papéis informados. */
function RoleRoute({ children, allow }: { children: React.ReactNode; allow: BoRole[] }) {
  return (
    <ProtectedRoute allow={allow}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/invoices" element={<Protected><InvoicesPage /></Protected>} />
      <Route path="/invoices/:id" element={<Protected><InvoiceDetailPage /></Protected>} />
      <Route path="/sellers" element={<Protected><SellersPage /></Protected>} />
      <Route path="/webhooks" element={<Protected><WebhooksPage /></Protected>} />
      <Route path="/coupons-overview" element={<Protected><CouponsOverviewPage /></Protected>} />
      <Route
        path="/coupons"
        element={
          <RoleRoute allow={["admin", "business"]}>
            <CouponsPage />
          </RoleRoute>
        }
      />
      <Route path="/coupons/:id" element={<Protected><CouponDetailPage /></Protected>} />
      <Route path="/redemptions" element={<Protected><RedemptionsPage /></Protected>} />
      <Route path="/pricing" element={<Protected><PlansPricesPage /></Protected>} />
      <Route
        path="/affiliates"
        element={
          <RoleRoute allow={["admin", "business"]}>
            <AffiliatesPage />
          </RoleRoute>
        }
      />
      <Route path="/businesses" element={<Protected><BusinessesPage /></Protected>} />
      <Route path="/commissions" element={<Protected><CommissionsPage /></Protected>} />
      <Route
        path="/business"
        element={
          <RoleRoute allow={["business", "admin"]}>
            <BusinessPanelPage />
          </RoleRoute>
        }
      />
      <Route
        path="/affiliate"
        element={
          <RoleRoute allow={["affiliate", "admin"]}>
            <AffiliatePanelPage />
          </RoleRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

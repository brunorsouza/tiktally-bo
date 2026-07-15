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

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
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
      <Route path="/coupons" element={<Protected><CouponsPage /></Protected>} />
      <Route path="/coupons/:id" element={<Protected><CouponDetailPage /></Protected>} />
      <Route path="/redemptions" element={<Protected><RedemptionsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

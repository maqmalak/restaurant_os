import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppProviders } from "./providers";
import { useAuth } from "@/hooks/useAuth";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";
import { LoginPage } from "@/pages/Auth/LoginPage";
import { AppShell } from "@/components/layout/app-shell";

const POSRoutes = lazy(() => import("@/pages/POS/POSRoutes").then((m) => ({ default: m.POSRoutes })));
const KDSPage = lazy(() => import("@/pages/Kitchen/KDSPage"));
const RestaurantRoutes = lazy(() => import("@/pages/Restaurant/RestaurantRoutes").then((m) => ({ default: m.RestaurantRoutes })));

/** Redirects signed-out visitors to the login screen. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Restaurant OS · POS. ERPNext (with POS Awesome) is the system of record; this app is the cashier's screen over
 * restaurant_os.api.pos. Router basename is /ros (main.tsx), so pages live at /ros/pos/…
 */
export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* full-screen kitchen display (no sidebar) */}
        <Route path="/kds" element={<RequireAuth><Suspense fallback={<FullPageLoader />}><KDSPage /></Suspense></RequireAuth>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="pos/*" element={<Suspense fallback={<FullPageLoader />}><POSRoutes /></Suspense>} />
          <Route path="restaurant/*" element={<Suspense fallback={<FullPageLoader />}><RestaurantRoutes /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
    </AppProviders>
  );
}

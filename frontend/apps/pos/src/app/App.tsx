import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppProviders } from "./providers";
import { useAuth } from "@/hooks/useAuth";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";
import { LoginPage } from "@/pages/Auth/LoginPage";
import { AppShell } from "@/components/layout/app-shell";

const POSRoutes = lazy(() => import("@/pages/POS/POSRoutes").then((m) => ({ default: m.POSRoutes })));
const KDSPage = lazy(() => import("@/pages/Kitchen/KDSPage"));
const RiderPage = lazy(() => import("@/pages/Delivery/RiderPage"));
const TrackPage = lazy(() => import("@/pages/Delivery/TrackPage"));
const DispatchPage = lazy(() => import("@/pages/Delivery/DispatchPage"));
const RestaurantRoutes = lazy(() => import("@/pages/Restaurant/RestaurantRoutes").then((m) => ({ default: m.RestaurantRoutes })));

/** Redirects signed-out visitors to the login screen; a rider (no counter role) always lands in the rider app. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const riderOnly = hasRole("Delivery Rider") && !hasRole("Sales User", "Sales Manager", "System Manager");
  if (riderOnly && location.pathname !== "/rider") return <Navigate to="/rider" replace />;
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
        {/* public: the customer's tracking link */}
        <Route path="/track/:key" element={<Suspense fallback={<FullPageLoader />}><TrackPage /></Suspense>} />
        <Route path="/rider" element={<RequireAuth><Suspense fallback={<FullPageLoader />}><RiderPage /></Suspense></RequireAuth>} />
        {/* full-screen kitchen display (no sidebar) */}
        <Route path="/kds" element={<RequireAuth><Suspense fallback={<FullPageLoader />}><KDSPage /></Suspense></RequireAuth>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="pos/*" element={<Suspense fallback={<FullPageLoader />}><POSRoutes /></Suspense>} />
          <Route path="restaurant/*" element={<Suspense fallback={<FullPageLoader />}><RestaurantRoutes /></Suspense>} />
          <Route path="dispatch" element={<Suspense fallback={<FullPageLoader />}><DispatchPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Routes>
    </AppProviders>
  );
}

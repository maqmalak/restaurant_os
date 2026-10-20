import { lazy, Suspense } from "react";
import { Route } from "react-router-dom";
import { ConfigRoutes } from "@/components/doc/config-routes";
import { FullPageLoader } from "@/pages/common/ComingSoonPage";
import { RESTAURANT_CONFIGS } from "./restaurant-configs";

const VariancePage = lazy(() => import("./VariancePage"));

/** /restaurant/* — branches, kitchen stations, tables, floor areas, menu modifiers, settings. */
export function RestaurantRoutes() {
  return <ConfigRoutes prefix="restaurant" configs={RESTAURANT_CONFIGS}
    extra={<Route path="variance" element={<Suspense fallback={<FullPageLoader />}><VariancePage /></Suspense>} />} />;
}

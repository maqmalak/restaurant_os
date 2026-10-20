import { ConfigRoutes } from "@/components/doc/config-routes";
import { RESTAURANT_CONFIGS } from "./restaurant-configs";

/** /restaurant/* — branches, kitchen stations, tables, floor areas, menu modifiers, settings. */
export function RestaurantRoutes() {
  return <ConfigRoutes prefix="restaurant" configs={RESTAURANT_CONFIGS} />;
}

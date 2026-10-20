import type { LucideIcon } from "lucide-react";
import {
  Armchair, BarChart3, Megaphone, MessageSquareHeart, Globe, TabletSmartphone, Bike, Gauge, Map, Scale, Trash2, Award, BadgePercent, ClipboardList, MonitorPlay, ReceiptText, Banknote, ChefHat, DoorClosed, DoorOpen, LayoutDashboard, LayoutGrid, PackagePlus, Settings2, ShoppingCart,
  SlidersHorizontal, SlidersVertical, Store, Ticket, UtensilsCrossed, Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
  /** Show only to users with one of these roles (empty = everyone). */
  roles?: string[];
  /** A full URL opened in a new tab (public pages like the ordering site), not a route inside this app. */
  external?: boolean;
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** The POS app's sidebar: selling, then the POS Awesome shift / cash / offer documents, then setup. */
export const POS_NAVIGATION: NavGroup[] = [
  {
    title: "Owner",
    items: [
      { label: "Owner Dashboard", to: "/restaurant/dashboard", icon: Gauge, roles: ["System Manager", "Sales Manager", "Accounts Manager"] },
      { label: "Reports", to: "/restaurant/reports", icon: BarChart3, roles: ["System Manager", "Sales Manager", "Accounts Manager", "Stock Manager"] },
    ],
  },
  {
    title: "Point of Sale",
    items: [
      { label: "Dashboard", to: "/pos", icon: LayoutDashboard },
      { label: "POS Terminal", to: "/pos/terminal", icon: Store },
      { label: "Table Map", to: "/pos/tables", icon: Armchair },
      { label: "Kitchen Display", to: "/kds", icon: MonitorPlay },
      { label: "Dispatch & Riders", to: "/dispatch", icon: Map },
      { label: "Online Ordering Site", to: "/ros/order", icon: Globe, external: true },
      { label: "Self-order Kiosk", to: "/ros/kiosk", icon: TabletSmartphone, external: true },
      { label: "Cash In / Out", to: "/pos/cash", icon: Wallet },
      { label: "Receive Stock", to: "/pos/stock", icon: PackagePlus },
      { label: "POS Invoices", to: "/pos/invoices", icon: ShoppingCart },
      { label: "Sales Invoices", to: "/pos/sales", icon: ReceiptText },
      { label: "Shift Openings", to: "/pos/openings", icon: DoorOpen },
      { label: "Shift Closings", to: "/pos/closings", icon: DoorClosed },
      { label: "Cash Movements", to: "/pos/cash-movements", icon: Banknote },
    ],
  },
  {
    title: "Setup",
    items: [
      { label: "POS Profiles", to: "/pos/profiles", icon: SlidersHorizontal },
      { label: "Offers", to: "/pos/offers", icon: BadgePercent },
      { label: "Coupons", to: "/pos/coupons", icon: Ticket },
      { label: "Loyalty Programs", to: "/pos/loyalty", icon: Award },
    ],
  },
  {
    title: "Guests",
    items: [
      { label: "Reviews", to: "/restaurant/reviews", icon: MessageSquareHeart },
      { label: "Campaigns", to: "/restaurant/campaigns", icon: Megaphone },
    ],
  },
  {
    title: "Restaurant",
    items: [
      { label: "Orders", to: "/restaurant/orders", icon: ClipboardList },
      { label: "Wastage", to: "/restaurant/wastage", icon: Trash2 },
      { label: "Ingredient Variance", to: "/restaurant/variance", icon: Scale },
      { label: "Riders", to: "/restaurant/riders", icon: Bike },
      { label: "Branches", to: "/restaurant/branches", icon: Store },
      { label: "Kitchen Stations", to: "/restaurant/stations", icon: ChefHat },
      { label: "Tables", to: "/restaurant/tables", icon: UtensilsCrossed },
      { label: "Floor Areas", to: "/restaurant/floor-areas", icon: LayoutGrid },
      { label: "Menu Modifiers", to: "/restaurant/modifiers", icon: SlidersVertical },
      { label: "Settings", to: "/restaurant/settings", icon: Settings2 },
    ],
  },
];

const ROUTE_TITLES: Record<string, string> = {
  pos: "POS",
  terminal: "Terminal",
  cash: "Cash In / Out",
  stock: "Receive Stock",
  invoices: "Invoices",
  openings: "Shift Openings",
  closings: "Shift Closings",
  "cash-movements": "Cash Movements",
  profiles: "POS Profiles",
  offers: "Offers",
  coupons: "Coupons",
  loyalty: "Loyalty Programs",
  new: "New",
  restaurant: "Restaurant",
  reviews: "Reviews",
  campaigns: "Campaigns",
  orders: "Orders",
  dashboard: "Owner Dashboard",
  reports: "Reports",
  dispatch: "Dispatch & Riders",
  riders: "Riders",
  wastage: "Wastage",
  variance: "Ingredient Variance",
  sales: "Sales Invoices",
  kds: "Kitchen Display",
  branches: "Branches",
  stations: "Kitchen Stations",
  tables: "Tables",
  "floor-areas": "Floor Areas",
  modifiers: "Menu Modifiers",
  settings: "Settings",
};

export function titleForSegment(segment: string): string {
  return ROUTE_TITLES[segment] ?? segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

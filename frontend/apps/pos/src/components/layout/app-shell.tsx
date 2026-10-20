import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { POS_NAVIGATION } from "@/app/navigation";
import { cn } from "@/utils/cn";

const COLLAPSE_KEY = "ros.sidebar.collapsed";

/** Sidebar + header around every POS page (the MicroMax shell, trimmed to the one POS app). */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* storage unavailable */ }
  }, [collapsed]);
  // Ctrl+B shows / hides the sidebar, as in the MicroMax app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar groups={POS_NAVIGATION} appLabel="Restaurant POS" mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenSidebar={() => setMobileOpen(true)} sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main className={cn("min-w-0 flex-1 p-3 sm:p-5")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, AtSign, Award, Bell, BellRing, ChevronRight, LogOut, ListTodo, Menu,  Settings as SettingsIcon, Share2, User as UserIcon, UserCheck, UserCircle, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { ThemeCustomizer } from "./theme-provider";
import { Logo } from "@/components/common/logo";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { titleForSegment } from "@/app/navigation";
import { useFrappeGetDocCount } from "frappe-react-sdk";
import { useNotificationLog } from "@/hooks/useNotificationLog";
import { docUrl } from "@/app/doc-routes";
import { formatDateTime } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { htmlToText } from "@/utils/text";

function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
      <Link to="/pos" className="transition-colors hover:text-foreground">
        Home
      </Link>
      {segments.map((seg, i) => {
        const to = `/${segments.slice(0, i + 1).join("/")}`;
        const isLast = i === segments.length - 1;
        // Dynamic segments (doc names) may be URL-encoded, e.g. a User's name
        // is its email ("%40" -> "@") — decode before titleForSegment's
        // ROUTE_TITLES lookup / fallback title-casing runs on it.
        const decoded = decodeURIComponent(seg);
        return (
          <span key={to} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="max-w-[16rem] truncate font-medium text-foreground">
                {titleForSegment(decoded)}
              </span>
            ) : (
              <Link to={to} className="transition-colors hover:text-foreground">
                {titleForSegment(decoded)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const LOG_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Assignment: UserCheck, Mention: AtSign, Alert: BellRing, Share: Share2, "Energy Point": Award,
};

interface BellItem {
  key: string; source: "frappe"; type: string; text: string; when: string; read: boolean;
  href?: string; external?: boolean; name: string;
}

function NotificationsBell() {
  // One bell for: Frappe's Notification Log (assignments, mentions, alerts, shares — what the desk bell shows)
  // and CRM notifications (follow-up reminders, CRM assignments / mentions). Open to-dos are linked in the footer.
  const { currentUser } = useAuth();
  const { data: todoCount } = useFrappeGetDocCount(
    "ToDo",
    [["status", "=", "Open"], ["allocated_to", "=", currentUser ?? ""]],
    false,
    currentUser ? `ros.todo.count.${currentUser}` : null,
    { refreshInterval: 30_000 },
  );
  const log = useNotificationLog();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: BellItem[] = [
    ...log.notifications.map((n): BellItem => {
      const u = n.document_type && n.document_name ? docUrl(n.document_type, n.document_name) : undefined;
      return { key: `f:${n.name}`, name: n.name, source: "frappe", type: n.type, text: htmlToText(n.subject) || n.type, when: n.creation,
        read: Boolean(n.read), href: u?.href, external: u?.external };
    }),
  ].sort((a, b) => b.when.localeCompare(a.when));
  const unread = log.unreadCount;

  const openItem = (n: BellItem) => {
    setOpen(false);
    if (!n.read) void log.markRead(n.name);
    if (!n.href) return;
    if (n.external) window.location.assign(n.href);
    else navigate(n.href);
  };
  const markAll = () => {
    if (log.unreadCount) void log.markRead();
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" title="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-40 mt-1 w-96 max-w-[calc(100vw-1.5rem)] animate-fade-in overflow-hidden rounded-xl border border-border bg-popover shadow-xl",
            "dark:border-white/10 dark:bg-[hsl(216_67%_9%_/_0.97)] dark:shadow-[0_18px_60px_rgb(2_6_23_/_0.55)] dark:backdrop-blur-xl",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications {unread > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">{unread} new</span>}
            </p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing new — you're all caught up.</p>
            ) : (
              items.slice(0, 25).map((n) => {
                const Icon = LOG_ICON[n.type] ?? Bell;
                return (
                  <button key={n.key} onClick={() => openItem(n)}
                    className={cn("flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-accent/50", !n.read && "bg-primary/5")}>
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      n.type === "Assignment" ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        : n.type === "Mention" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : n.type === "Alert" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground")}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-snug">{n.text}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        {n.type} · {formatDateTime(n.when)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <a href="/desk/todo" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ListTodo className="h-3.5 w-3.5" /> {Number(todoCount ?? 0)} open to-do{Number(todoCount ?? 0) === 1 ? "" : "s"}
            </a>
            <a href="/desk/notification-log" className="text-primary hover:underline">All notifications</a>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({
  onOpenSidebar,
  brand = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  /** Omitted on routes with no sidebar (the Desktop launcher) — hides the toggle. */
  onOpenSidebar?: () => void;
  /** Desktop show / hide of the sidebar. */
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  /** Show the logo — used on the Desktop launcher, which has no sidebar to carry it. */
  brand?: boolean;
}) {
  const { user, currentUser, roles, logout } = useAuth();
  const { company, setCompany, companies } = useCompanyContext();

  const fullName = user?.full_name ?? currentUser ?? "User";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:border-white/10 dark:bg-white/[0.03] dark:supports-[backdrop-filter]:bg-white/[0.03] sm:px-4">
      {onOpenSidebar && (
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      )}
      {onToggleSidebar && (
        <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"} title={`${sidebarCollapsed ? "Show" : "Hide"} sidebar (Ctrl+B)`}>
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      )}

      {brand && <Logo className="h-8 w-auto shrink-0" />}
      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Company selector */}
        {companies.length > 0 && (
          <Select
            value={company ?? ""}
            onChange={(e) => setCompany(e.target.value)}
            className="hidden h-8 w-40 text-xs md:block"
            aria-label="Active company"
          >
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </Select>
        )}

        <NotificationsBell />
        <ThemeCustomizer />

        <DropdownMenu
          align="end"
          width="w-60"
          trigger={
            <button className="flex items-center gap-2 rounded-md p-0.5 transition-colors hover:bg-accent" aria-label="User menu">
              <Avatar name={fullName} src={user?.user_image} size="sm" />
            </button>
          }
          items={[
            { label: fullName, icon: <UserIcon className="h-4 w-4" />, disabled: true },
            { label: user?.email ?? currentUser ?? "—", disabled: true },
            { separator: true, label: "" },
            { label: `Roles: ${roles.slice(0, 3).join(", ") || "—"}`, disabled: true },
            { label: `Language: ${user?.language ?? "en"}`, disabled: true },
            { label: `Time Zone: ${user?.time_zone ?? "—"}`, disabled: true },
            { label: `Company: ${company ?? "—"}`, disabled: true },
            { separator: true, label: "" },
            { label: "My Settings (desk)", icon: <UserCircle className="h-4 w-4" />, onClick: () => window.location.assign(`/desk/user/${encodeURIComponent(currentUser ?? "")}`) },
            { label: "ERPNext Desk", icon: <SettingsIcon className="h-4 w-4" />, onClick: () => window.location.assign("/desk") },
            { separator: true, label: "" },
            { label: "Sign out", icon: <LogOut className="h-4 w-4" />, destructive: true, onClick: () => void logout() },
          ]}
        />
      </div>
    </header>
  );
}

export { Badge };
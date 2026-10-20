import * as React from "react";
import { useFrappeAuth, useFrappeGetCall, useFrappeGetDoc } from "frappe-react-sdk";
import { refreshCSRFToken } from "@/services/frappe";
import type { FrappeUser } from "@/types/frappe";

/**
 * Authentication + session context.
 *
 * Wraps the SDK's `useFrappeAuth` (cookie/session auth) and enriches it with
 * the ERPNext User document (full name, email, language, time zone) and the
 * user's roles / default company. Permissions themselves are always enforced
 * by Frappe on the server — roles here only drive UI affordances.
 */

export interface AuthState {
  /** Login id (email) of the current user, or null when logged out. */
  currentUser: string | null | undefined;
  user?: FrappeUser;
  roles: string[];
  defaultCompany?: string;
  isLoading: boolean;
  isAuthenticated: boolean;
  error?: unknown;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = React.createContext<AuthState | null>(null);

const GUEST = "Guest";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    isLoading: authLoading,
    error,
    updateCurrentUser,
    getUserCookie,
  } = useFrappeAuth();

  const isAuthenticated = Boolean(currentUser && currentUser !== GUEST);

  // Full User document — only fetched when authenticated.
  const { data: userDoc, isLoading: userLoading } = useFrappeGetDoc<FrappeUser>(
    "User",
    isAuthenticated ? (currentUser as string) : undefined,
    isAuthenticated ? `micromax.user.${currentUser}` : null,
  );

  // Roles of the logged-in user (server-evaluated).
  const { data: rolesData } = useFrappeGetCall<{ message: string[] } | string[]>(
    "frappe.client.get_list",
    {
      doctype: "Has Role",
      filters: JSON.stringify([["parent", "=", currentUser ?? ""]]),
      fields: JSON.stringify(["role"]),
      parent: "User",
      limit_page_length: 0,
    },
    isAuthenticated ? `micromax.roles.${currentUser}` : null,
  );

  const roles = React.useMemo(() => {
    const raw = (rolesData as any)?.message ?? rolesData ?? [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r: any) => (typeof r === "string" ? r : r?.role))
      .filter(Boolean) as string[];
  }, [rolesData]);

  // Default company from ERPNext Global Defaults / user defaults.
  // (read server-side: Global Defaults itself is readable only by System Managers)
  const { data: defaults } = useFrappeGetCall<{ default_company?: string }>(
    "restaurant_os.api.pos.default_company",
    undefined,
    isAuthenticated ? "micromax.defaults.company" : null,
  );

  /**
   * Frappe's `/api/method/login` only accepts **form-encoded** `usr`/`pwd`.
   * The SDK's `loginWithUsernamePassword` sends JSON `{username, password}`,
   * which Frappe rejects with "Incomplete login details". We call the endpoint
   * directly with the correct encoding, then refresh the SDK session state.
   */
  const login = React.useCallback(
    async (username: string, password: string) => {
      const body = new URLSearchParams({ usr: username, pwd: password });
      const res = await fetch("/api/method/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });
      if (!res.ok) {
        let message = `Login failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          const serverMsg = (data as any)?._server_messages;
          if (serverMsg) {
            const parsed = JSON.parse(serverMsg);
            message = parsed.map((m: any) => m.message).join(" ");
          } else {
            message = (data as any)?.message ?? message;
          }
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }
      // Cookie is now set — refresh cookie-derived user_id AND revalidate the
      // get_logged_user SWR cache so isAuthenticated flips to true.
      getUserCookie();
      await updateCurrentUser();
      // New session => new CSRF token; refresh it before any write requests.
      await refreshCSRFToken();
    },
    [updateCurrentUser, getUserCookie],
  );

  const logout = React.useCallback(async () => {
    // Unlike login (a guest-context request Frappe never CSRF-checks), logout
    // mutates an authenticated session, so it needs the same
    // `X-Frappe-CSRF-Token` header the axios `http` instance attaches
    // automatically (see services/frappe.ts) — this raw fetch bypasses that
    // interceptor, so without it the server rejects the POST with
    // CSRFTokenError and the session is silently never destroyed.
    const csrfToken = (window as unknown as { csrf_token?: string }).csrf_token;
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "include",
      headers: csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : undefined,
    }).catch(() => undefined);
    getUserCookie();
    await updateCurrentUser();
    // Session destroyed — grab a fresh (guest) CSRF token.
    await refreshCSRFToken();
    // A real browser navigation rather than react-router's `useNavigate()`:
    // called from this deep in AuthProvider's async flow, `navigate()` hit
    // react-router's internal `activeRef` guard (traced — it ran with no
    // error but silently never touched history, even deferred a tick).
    // `location.assign` sidesteps that entirely and, as a bonus, hard-resets
    // every in-memory cache (SWR, component state) rather than leaving stale
    // authenticated data sitting behind the login screen.
    window.location.assign("/ros/login");
  }, [updateCurrentUser, getUserCookie]);

  const hasRole = React.useCallback(
    (...wanted: string[]) =>
      wanted.length === 0 ||
      roles.includes("Administrator") ||
      roles.includes("System Manager") ||
      wanted.some((r) => roles.includes(r)),
    [roles],
  );

  const value: AuthState = {
    currentUser,
    user: userDoc as FrappeUser | undefined,
    roles,
    defaultCompany: (defaults as any)?.message?.default_company ?? (defaults as any)?.default_company,
    isLoading: authLoading || (isAuthenticated && userLoading),
    isAuthenticated,
    error,
    login,
    logout,
    refresh: updateCurrentUser,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
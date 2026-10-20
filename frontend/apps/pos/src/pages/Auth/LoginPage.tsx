import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { Logo } from "@/components/common/logo";
import { useAuth } from "@/hooks/useAuth";
import { humanizeError } from "@/services/frappe";

/** Cashier sign-in (an ERPNext user with a POS Profile). */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from || "/pos";

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate(from === "/login" ? "/pos" : from, { replace: true });
  }, [isAuthenticated, isLoading, navigate, from]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="relative w-full max-w-sm animate-fade-in">
        <Logo className="mb-6 h-11 w-auto" />
        <p className="mb-4 text-sm text-muted-foreground">Sign in with your ERPNext account to open the counter.</p>
        <Card>
          <CardContent className="space-y-4 p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="usr">Email / Username</Label>
                <Input id="usr" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pwd">Password</Label>
                <Input id="pwd" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Authentication, permissions and data are managed by ERPNext.</p>
      </div>
    </div>
  );
}

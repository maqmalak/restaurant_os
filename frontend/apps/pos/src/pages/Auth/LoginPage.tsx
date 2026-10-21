import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { MicroMaxLogo, shot, SITE_STYLE } from "@/pages/Site/brand";
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
  const [show, setShow] = useState(false);
  const from = (location.state as { from?: string } | null)?.from || "/pos";

  useEffect(() => { document.title = "Sign in · MicroMax POS"; }, []);
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
    <div className="mx grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      <style>{SITE_STYLE}</style>
      {/* brand panel */}
      <aside className="relative hidden min-h-screen flex-col justify-between gap-8 overflow-hidden bg-[#0b0a09] p-10 text-[#f6efe4] lg:flex xl:p-12">
        <div className="grain pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -left-40 -top-32 h-[36rem] w-[36rem] rounded-full bg-[#e59a3a]/[0.14] blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[30rem] w-[30rem] rounded-full bg-[#0d9488]/[0.12] blur-[130px]" />
        <Link to="/" className="relative w-fit"><MicroMaxLogo /></Link>
        <div className="relative max-w-lg">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-[#f5c46b]/85">Welcome back</div>
          <h1 className="serif mt-4 text-5xl font-semibold leading-[1.05]">Your restaurant, <span className="gold-grad">ready when you are.</span></h1>
          <p className="mt-5 text-lg leading-relaxed text-white/60">Open the counter, watch the kitchen and follow every delivery — the moment you sign in.</p>
        </div>
        <div className="relative [@media(max-height:760px)]:hidden">
          <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_40px_90px_-35px_rgba(0,0,0,.9)] [transform:perspective(1600px)_rotateY(-8deg)_rotateX(4deg)]">
            <img src={shot("terminal")} alt="" className="block w-full" />
          </div>
          <div className="glass float absolute -bottom-6 -right-2 rounded-2xl px-4 py-3 text-sm">
            <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><ShieldCheck className="h-5 w-5" /></span>
              <div><div className="font-semibold text-white">Secure sign-in</div><div className="text-xs text-white/55">Roles & permissions by ERPNext</div></div></div>
          </div>
        </div>
        <div className="relative flex gap-6 text-sm text-white/50">
          {["Counter & kitchen", "Online & riders", "Stock & reports"].map((t) => <span key={t} className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#f5c46b]" />{t}</span>)}
        </div>
      </aside>

      {/* form */}
      <main className="relative flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to website</Link>
          <ThemeToggle />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <div className="lg:hidden"><span className="inline-block rounded-2xl bg-[#0b0a09] px-4 py-3"><MicroMaxLogo /></span></div>
          <h2 className="serif mt-8 text-4xl font-semibold tracking-tight lg:mt-0">Sign in</h2>
          <p className="mt-2 text-muted-foreground">Use your MicroMax POS account to open the counter.</p>
          <form onSubmit={onSubmit} className="mt-9 space-y-5">
            <div className="space-y-2">
              <label htmlFor="usr" className="text-sm font-medium">Email or username</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="usr" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="you@restaurant.pk"
                  className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-[15px] shadow-sm transition focus:border-[#e59a3a] focus:outline-none focus:ring-4 focus:ring-[#e59a3a]/15" />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="pwd" className="text-sm font-medium">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="pwd" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-12 text-[15px] shadow-sm transition focus:border-[#e59a3a] focus:outline-none focus:ring-4 focus:ring-[#e59a3a]/15" />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:text-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </div>
            {error && (
              <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <button type="submit" disabled={submitting} className="btn-gold inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition disabled:opacity-60">
              {submitting ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}</button>
          </form>
          <p className="mt-8 text-center text-sm text-muted-foreground">New to MicroMax POS? <Link to="/#demo" className="font-semibold text-[#b9781f] hover:underline dark:text-[#f5c46b]">Book a free demo</Link></p>
        </div>
        <p className="text-center text-xs text-muted-foreground">Accounts, permissions and data are managed securely by ERPNext.</p>
      </main>
    </div>
  );
}

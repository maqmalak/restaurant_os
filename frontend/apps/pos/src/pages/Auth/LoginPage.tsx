import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChefHat, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
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
      {/* brand panel: a staged product scene */}
      <aside className="relative hidden h-screen min-h-[640px] flex-col overflow-hidden bg-[#0a0908] text-[#f6efe4] lg:sticky lg:top-0 lg:flex">
        <div className="grain pointer-events-none absolute inset-0" />
        {/* light */}
        <div className="pointer-events-none absolute -left-32 -top-40 h-[38rem] w-[38rem] rounded-full bg-[#e59a3a]/[0.16] blur-[130px]" />
        <div className="pointer-events-none absolute -bottom-48 -right-24 h-[34rem] w-[34rem] rounded-full bg-[#0d9488]/[0.14] blur-[130px]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,rgba(245,196,107,.10),transparent_65%)]" />
        <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_60%_70%,black,transparent_70%)]" />

        <div className="relative flex items-center justify-between px-10 pt-9 xl:px-14">
          <Link to="/"><MicroMaxLogo /></Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-1 text-xs font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> All systems running</span>
        </div>

        <div className="relative px-10 pt-[6vh] xl:px-14">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-[#f5c46b]/85">Welcome back</div>
          <h1 className="serif mt-3 max-w-xl text-[clamp(2.3rem,3.4vw,3.6rem)] font-semibold leading-[1.04]">Your restaurant, <span className="gold-grad">ready when you are.</span></h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/55 xl:text-lg">Counter, kitchen and deliveries pick up exactly where you left them.</p>
        </div>

        {/* devices */}
        <div className="relative mt-auto flex min-h-0 flex-1 items-end justify-center px-10 pb-0 pt-8 xl:px-14">
          <div className="relative aspect-[16/11] h-full max-h-[460px] w-auto max-w-full">
            {/* monitor */}
            <div className="absolute left-[6%] right-[2%] top-[4%]">
              <div className="rounded-[18px] border border-white/10 bg-gradient-to-b from-[#2a2622] to-[#161311] p-[1.4%] shadow-[0_50px_100px_-40px_rgba(0,0,0,.95),inset_0_1px_0_rgba(255,255,255,.08)]">
                <div className="overflow-hidden rounded-[10px] bg-black ring-1 ring-black/60">
                  <img src={shot("terminal-clean")} alt="MicroMax POS terminal" className="block aspect-[16/10] w-full object-cover object-top" />
                </div>
              </div>
              <div className="mx-auto h-[5%] min-h-[14px] w-[16%] bg-gradient-to-b from-[#2a2622] to-[#1a1714]" />
              <div className="mx-auto h-[8px] w-[34%] rounded-full bg-gradient-to-b from-[#2f2a25] to-[#191613] shadow-[0_18px_30px_-10px_rgba(0,0,0,.9)]" />
            </div>
            {/* phone */}
            <div className="float absolute bottom-[3%] left-0 w-[21%]" style={{ animationDelay: ".6s" }}>
              <div className="overflow-hidden rounded-[22px] border-[5px] border-[#1d1a17] bg-[#1d1a17] shadow-[0_35px_60px_-25px_rgba(0,0,0,.95)] ring-1 ring-white/10">
                <img src={shot("order-phone")} alt="" className="block aspect-[9/17] w-full rounded-[16px] object-cover object-top" />
              </div>
            </div>
            {/* customer display card */}
            <div className="float absolute -right-[2%] bottom-[16%] w-[30%] overflow-hidden rounded-xl border border-white/10 shadow-[0_30px_60px_-25px_rgba(0,0,0,.95)]" style={{ animationDelay: "1.4s" }}>
              <img src={shot("display")} alt="" className="block aspect-[16/10] w-full object-cover" />
            </div>
            {/* live chips */}
            <div className="glass float absolute left-[24%] top-0 rounded-2xl px-3.5 py-2.5 shadow-2xl" style={{ animationDelay: ".2s" }}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Today's sales</div>
              <div className="mt-0.5 flex items-baseline gap-2"><span className="text-lg font-bold tabular-nums">Rs 22,798</span><span className="rounded-full bg-emerald-400/15 px-1.5 text-[11px] font-semibold text-emerald-300">+19%</span></div>
            </div>
            <div className="glass float absolute right-[4%] top-[-2%] flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-2xl" style={{ animationDelay: "1s" }}>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f5c46b]/15 text-[#f5c46b]"><ChefHat className="h-4 w-4" /></span>
              <div><div className="text-sm font-semibold">Order #34 ready</div><div className="text-[11px] text-white/50">Rider Imran assigned</div></div>
            </div>
          </div>
        </div>
      </aside>

      {/* form */}
      <main className="relative flex min-h-screen flex-col overflow-x-hidden px-6 py-8 sm:px-10">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[26rem] w-[26rem] rounded-full bg-[#e59a3a]/[0.08] blur-[110px]" />
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to website</Link>
          <ThemeToggle />
        </div>
        <div className="relative mx-auto my-auto w-full max-w-[26rem] py-10">
          <div className="rounded-[28px] border border-border/70 bg-card/70 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,.45)] backdrop-blur-xl sm:p-10">
          <div className="lg:hidden"><span className="inline-block rounded-2xl bg-[#0b0a09] px-4 py-3"><MicroMaxLogo /></span></div>
          <h2 className="serif mt-8 text-[2.6rem] font-semibold leading-none tracking-tight lg:mt-0">Sign in</h2>
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
          <div className="mt-7 flex items-center justify-center gap-5 border-t border-border/70 pt-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Encrypted session</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#e59a3a]" /> Role-based access</span>
          </div>
          </div>
          <p className="mt-7 text-center text-sm text-muted-foreground">New to MicroMax POS? <Link to="/#demo" className="font-semibold text-[#b9781f] hover:underline dark:text-[#f5c46b]">Book a free demo</Link></p>
        </div>
        <p className="text-center text-xs text-muted-foreground">Accounts, permissions and data are managed securely by ERPNext.</p>
      </main>
    </div>
  );
}

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  BarChart3,
  Boxes,
  AtSign,
  Lock,
  ArrowRight,
  AlertCircle,
  Check,
} from "lucide-react";
import { SyncPulse } from "@/components/erp/auth/sync-pulse";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — SyncWithUs ERP" },
      { name: "description", content: "Secure sign-in to the SyncWithUs ERP workspace for Hobby Shop & Toyora." },
      { property: "og:title", content: "Sign in — SyncWithUs ERP" },
      { property: "og:description", content: "Secure sign-in to the SyncWithUs ERP workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const FEATURES = [
  { n: "01", icon: Boxes, text: "Multi-brand inventory & order pipeline", chip: "2 brands" },
  { n: "02", icon: BarChart3, text: "Live P&L, marketing ROAS, cash flow", chip: "Live" },
  { n: "03", icon: ShieldCheck, text: "Role-based access with full audit trail", chip: "Secure" },
];

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      navigate({ to: "/erp" });
    });
  }, [navigate]);

  const fail = (msg: string) => {
    setError(msg);
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        // Resolve "username or email" -> email via RPC
        let email = identifier.trim();
        if (!email.includes("@")) {
          const { data: resolved, error: rpcErr } = await supabase
            .rpc("resolve_login_email", { p_identifier: email });
          if (rpcErr) throw rpcErr;
          if (!resolved) throw new Error("Incorrect username or password. Try again.");
          email = resolved as string;
        }
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
        toast.success("Welcome back");
      } else {
        const email = identifier.trim();
        if (!email.includes("@")) throw new Error("Sign up er jonno email lagbe.");
        const { error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;
        toast.success("Account created — check your email if confirmation is required");
      }
      await router.invalidate();
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        navigate({ to: "/erp" });
      } else if (mode === "signup") {
        toast.message("Please confirm your email, then sign in.");
      } else {
        fail("Sign-in failed. Please try again.");
        toast.error("Sign-in failed. Please try again.");
      }
    } catch (err) {
      const msg =
        err instanceof Error && !/invalid login credentials/i.test(err.message)
          ? err.message
          : "Incorrect username or password. Try again.";
      fail(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* ── Left / brand panel ─────────────────────────────── */}
      <aside
        className="relative hidden w-[54%] shrink-0 flex-col justify-between overflow-hidden p-12 xl:p-14 min-[880px]:flex"
        style={{ background: "#08080C" }}
      >
        {/* radial indigo glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-[15%] -top-[25%] h-[70%] w-[70%] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, oklch(0.55 0.19 275 / 0.42), transparent 65%)" }}
        />
        {/* grain */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/></filter><rect width='140' height='140' filter='url(%23n)'/></svg>\")",
          }}
        />
        {/* 44px grid, faded at edges */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 45% 40%, black 25%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse at 45% 40%, black 25%, transparent 78%)",
          }}
        />

        {/* top bar */}
        <div className="auth-rise relative flex items-center justify-between" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white shadow-lg"
              style={{ background: "linear-gradient(140deg, #6E7AE0, #3B3F8F)" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" strokeLinecap="round" />
                <path d="M17 3v4h-4M7 21v-4h4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">SyncWithUs</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            <span
              className="sync-status-dot h-1.5 w-1.5 rounded-full"
              style={{ background: "#4CB782", boxShadow: "0 0 8px 1px oklch(0.72 0.14 158 / 0.8)" }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
              All systems synced
            </span>
          </div>
        </div>

        {/* body */}
        <div className="relative space-y-9">
          <div className="auth-rise" style={{ animationDelay: "180ms" }}>
            <SyncPulse />
          </div>

          <div className="space-y-4">
            <p
              className="auth-rise font-mono text-[10px] uppercase tracking-[0.28em] text-white/40"
              style={{ animationDelay: "300ms" }}
            >
              SWUS ERP Platform
            </p>
            <h1
              className="auth-rise max-w-xl text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white xl:text-[3.1rem]"
              style={{ animationDelay: "380ms" }}
            >
              Every order, every brand,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(100deg, #A8B0F5, #FFFFFF)" }}
              >
                in sync.
              </span>
            </h1>
            <p
              className="auth-rise max-w-md text-[15px] leading-relaxed text-white/55"
              style={{ animationDelay: "460ms" }}
            >
              Orders, inventory, imports, marketing and finance — one operating layer for Hobby Shop and
              Toyora Kids, updated in real time.
            </p>
          </div>

          {/* feature status rows */}
          <ul className="border-t border-white/10">
            {FEATURES.map(({ n, icon: Icon, text, chip }, i) => (
              <li
                key={n}
                className="auth-rise flex items-center gap-4 border-b border-white/[0.07] py-3.5"
                style={{ animationDelay: `${540 + i * 90}ms` }}
              >
                <span className="font-mono text-[11px] text-white/30">{n}</span>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-[10px]"
                  style={{ background: "rgba(94,106,210,0.16)", border: "1px solid rgba(94,106,210,0.28)" }}
                >
                  <Icon className="h-4 w-4 text-[#A8B0F5]" />
                </span>
                <span className="flex-1 text-[13.5px] text-white/75">{text}</span>
                <span className="rounded-[6px] border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                  {chip}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* footer */}
        <div
          className="auth-rise relative flex items-center justify-between text-[11px] text-white/35"
          style={{ animationDelay: "900ms" }}
        >
          <span>© {new Date().getFullYear()} SyncWithUs — Internal use only</span>
          <span className="font-mono tracking-[0.12em]">v2.0.4</span>
        </div>
      </aside>

      {/* ── Right / form panel ─────────────────────────────── */}
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-6 py-12 sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in oklab, var(--primary) 22%, transparent) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            opacity: 0.35,
            maskImage: "radial-gradient(ellipse at 50% 40%, black, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black, transparent 80%)",
          }}
        />

        <div className="auth-card-in relative w-full max-w-[400px]">
          {/* mobile brand */}
          <div className="mb-7 flex items-center gap-2.5 min-[880px]:hidden">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
              style={{ background: "linear-gradient(140deg, #6E7AE0, #3B3F8F)" }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight">SyncWithUs ERP</span>
          </div>

          <div className="rounded-[var(--radius-card)] border border-border bg-card p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.18)] sm:p-8">
            <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to continue to your dashboard."
                : "Set up access to the ERP workspace."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div className="space-y-2">
                <Label
                  htmlFor="identifier"
                  className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {mode === "signin" ? "Username or Email" : "Email"}
                </Label>
                <div className="group relative">
                  <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="identifier"
                    type={mode === "signin" ? "text" : "email"}
                    required
                    placeholder={mode === "signin" ? "yourname or you@example.com" : "you@example.com"}
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (error) setError(null);
                    }}
                    autoComplete={mode === "signin" ? "username" : "email"}
                    className="h-11 rounded-[var(--radius-input)] pl-10 transition-shadow duration-200 focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_var(--primary-subtle)] focus-visible:ring-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                >
                  Password
                </Label>
                <div className={`group relative ${shake ? "auth-shake" : ""}`}>
                  <Lock
                    className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${
                      error ? "text-destructive" : "text-muted-foreground group-focus-within:text-primary"
                    }`}
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    aria-invalid={!!error}
                    aria-describedby={error ? "auth-error" : undefined}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className={`h-11 rounded-[var(--radius-input)] pl-10 pr-11 transition-shadow duration-200 focus-visible:ring-0 ${
                      error
                        ? "border-destructive shadow-[0_0_0_4px_color-mix(in_oklab,var(--destructive)_16%,transparent)] focus-visible:border-destructive"
                        : "focus-visible:border-primary focus-visible:shadow-[0_0_0_4px_var(--primary-subtle)]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-chip)] p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 transition-transform duration-200" />
                    ) : (
                      <Eye className="h-4 w-4 transition-transform duration-200" />
                    )}
                  </button>
                </div>
                {error ? (
                  <p
                    id="auth-error"
                    role="alert"
                    className="auth-error-in flex items-center gap-1.5 text-[12.5px] text-destructive"
                  >
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  aria-pressed={remember}
                  className="focus-ring group flex items-center gap-2 rounded-[var(--radius-chip)] text-[13px] text-muted-foreground"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors ${
                      remember ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                    }`}
                  >
                    {remember ? <Check className="h-3 w-3" /> : null}
                  </span>
                  Remember me
                </button>
                <a
                  href="mailto:admin@syncwithus.co?subject=ERP%20password%20reset"
                  className="focus-ring rounded-[var(--radius-chip)] text-[13px] font-medium text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="group h-11 w-full rounded-[var(--radius-control)] text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-lg hover:shadow-primary/25"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    {mode === "signin" ? "Sign in" : "Create account"}
                    <ArrowRight className="ml-1.5 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {mode === "signin" ? "New here?" : "Already registered?"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="focus-ring block w-full rounded-[var(--radius-control)] border border-border py-2.5 text-center text-sm font-medium text-foreground/80 transition-colors duration-200 hover:border-primary/45 hover:bg-primary/[0.06] hover:text-foreground"
              >
                {mode === "signin" ? "Create an account" : "Sign in instead"}
              </button>
            </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Protected workspace. Access is monitored and logged.
          </p>
        </div>
      </main>
    </div>
  );
}

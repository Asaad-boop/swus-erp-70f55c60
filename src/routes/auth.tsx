import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, ShieldCheck, Sparkles, BarChart3, Boxes, AtSign, Lock, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — SyncWithUs ERP" },
      { name: "description", content: "Secure sign-in to the SyncWithUs ERP workspace for Hobby Shop & Toyora." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      navigate({ to: "/erp" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        // Resolve "username or email" -> email via RPC
        let email = identifier.trim();
        if (!email.includes("@")) {
          const { data: resolved, error: rpcErr } = await supabase
            .rpc("resolve_login_email", { p_identifier: email });
          if (rpcErr) throw rpcErr;
          if (!resolved) throw new Error("Username khuje pawa jay nai. Email diye try korun.");
          email = resolved as string;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      } else {
        const email = identifier.trim();
        if (!email.includes("@")) throw new Error("Sign up er jonno email lagbe.");
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required");
      }
      await router.invalidate();
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        navigate({ to: "/erp" });
      } else if (mode === "signup") {
        // Sign-up succeeded but email confirmation required — stay on page.
        toast.message("Please confirm your email, then sign in.");
      } else {
        // Defensive: no session after sign-in — surface as error, do NOT redirect.
        toast.error("Sign-in failed. Please try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: Boxes, text: "Multi-brand inventory & order pipeline" },
    { icon: BarChart3, text: "Live P&L, marketing ROAS, cash flow" },
    { icon: ShieldCheck, text: "Role-based access with full audit trail" },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-14">
        {/* animated aurora */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="auth-aurora absolute -left-1/4 -top-1/3 h-[80%] w-[80%] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(1 0 0 / 0.28), transparent 62%)" }}
          />
          <div
            className="auth-aurora-slow absolute -bottom-1/3 -right-1/4 h-[85%] w-[85%] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(0.75 0.16 250 / 0.45), transparent 62%)" }}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)",
            backgroundSize: "34px 34px",
            maskImage: "radial-gradient(circle at 40% 40%, black, transparent 78%)",
          }}
        />

        <div className="auth-rise relative flex items-center gap-3" style={{ animationDelay: "60ms" }}>
          <div className="auth-float flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-foreground/12 ring-1 ring-primary-foreground/25 backdrop-blur">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight">SyncWithUs</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary-foreground/60">ERP Platform</div>
          </div>
        </div>

        <div className="relative space-y-10">
          <div className="space-y-4">
            <h1 className="auth-rise text-4xl font-bold leading-[1.08] tracking-tight xl:text-[3.35rem]" style={{ animationDelay: "160ms" }}>
              Run Hobby Shop &amp; Toyora
              <span className="block text-primary-foreground/70">from one place.</span>
            </h1>
            <p className="auth-rise max-w-md text-base leading-relaxed text-primary-foreground/70" style={{ animationDelay: "260ms" }}>
              Orders, inventory, imports, marketing and finance — unified for both brands with real-time insights.
            </p>
          </div>

          <ul className="grid gap-3 text-sm">
            {features.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="auth-rise group flex items-center gap-3 rounded-2xl border border-primary-foreground/10 bg-primary-foreground/[0.06] p-3 backdrop-blur-sm transition-all duration-300 hover:translate-x-1 hover:border-primary-foreground/25 hover:bg-primary-foreground/[0.12]"
                style={{ animationDelay: `${360 + i * 110}ms` }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/12 ring-1 ring-primary-foreground/20 transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-primary-foreground/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-rise relative text-xs text-primary-foreground/55" style={{ animationDelay: "760ms" }}>
          © {new Date().getFullYear()} SyncWithUs — Internal use only
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center overflow-hidden bg-background px-6 py-12 sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 55%), radial-gradient(circle at 10% 100%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 55%)",
          }}
        />

        <div className="auth-rise relative w-full max-w-sm" style={{ animationDelay: "120ms" }}>
          {/* Mobile brand */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">SyncWithUs ERP</span>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card/70 p-7 shadow-[0_24px_60px_-30px_oklch(0_0_0_/_0.45)] backdrop-blur-xl sm:p-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === "signin"
                  ? "Sign in to continue to your dashboard."
                  : "Set up access to the ERP workspace."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete={mode === "signin" ? "username" : "email"}
                    className="h-12 rounded-xl pl-10 transition-all duration-200 focus-visible:ring-[3px]"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Password
                </Label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    className="h-12 rounded-xl pl-10 pr-11 transition-all duration-200 focus-visible:ring-[3px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="auth-sheen group relative h-12 w-full overflow-hidden rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.985]"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait…
                  </>
                ) : (
                  <>
                    {mode === "signin" ? "Sign in" : "Create account"}
                    <ArrowRight className="ml-1.5 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {mode === "signin" ? "New here?" : "Already registered?"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="block w-full rounded-xl border border-border/70 py-2.5 text-center text-sm font-medium text-foreground/80 transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
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
      </div>
    </div>
  );
}

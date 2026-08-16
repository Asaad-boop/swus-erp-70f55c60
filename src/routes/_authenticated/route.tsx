import { createFileRoute, Navigate, Outlet, useLocation, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { hasBackofficeAccess, moduleForPath, resolveAccess } from "@/lib/erp/access";
import { firstAllowedPage } from "@/lib/erp/permissions/page-catalog";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthGate,
});

type Status =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "authed"; roles: string[]; allowedPages: string[] | null };

function AuthGate() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!u.user) {
        setStatus({ kind: "guest" });
        return;
      }
      const [rolesRes, permsRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
        supabase.from("staff_permissions").select("permissions").eq("user_id", u.user.id).maybeSingle(),
      ]);
      if (!mounted) return;
      const roles = (rolesRes.data ?? []).map((r) => r.role as string);
      const permJson = (permsRes.data as any)?.permissions as { allowedPages?: string[] } | null;
      const allowedPages = Array.isArray(permJson?.allowedPages) && permJson!.allowedPages!.length > 0
        ? permJson!.allowedPages!
        : null;
      setStatus({ kind: "authed", roles, allowedPages });
    };

    void load();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setStatus({ kind: "guest" });
      } else if (event === "SIGNED_IN") {
        void load();
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (status.kind === "loading") return <div className="min-h-screen bg-background" />;
  if (status.kind === "guest") return <Navigate to="/auth" replace />;

  const { roles, allowedPages } = status;
  const isAdmin = roles.includes("admin");
  const path = location.pathname;
  const isErp = path === "/erp" || path.startsWith("/erp/");

  // 1. No role modules AND no custom page grants → nothing to show.
  if (isErp && !isAdmin && !hasBackofficeAccess(roles, allowedPages)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Ei account er ERP backoffice e dhukar permission nei. Admin ke bolun proper role assign
            korte.
          </p>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  // 2. Per-path access check — one shared resolver for gate + sidebar.
  const allowed = resolveAccess(roles, allowedPages, path);
  if (!allowed) {
    const mod = moduleForPath(path);
    const fallback = isAdmin ? "/erp" : firstAllowedPage(allowedPages);
    // Landing page itself blocked → send them to their first allowed page.
    if (path !== fallback && (path === "/erp" || path === "/erp/")) {
      return <Navigate to={fallback as never} replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive grid place-items-center">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">Permission nei</h1>
            <p className="text-sm text-muted-foreground">
              Ei page <code className="px-1.5 py-0.5 rounded bg-muted text-[12px]">{path}</code>{" "}
              {mod ? `(${mod})` : ""} access korar permission tomar role e nei. Admin ke bolun shei
              module er role assign korte.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: fallback as never })}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Dashboard
            </Button>
          </div>
          <div className="pt-2 text-[11px] text-muted-foreground">
            Your roles: {roles.length ? roles.join(", ") : "(none)"}
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

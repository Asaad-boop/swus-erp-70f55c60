import {
  createFileRoute,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { hasBackofficeAccess, isSuperRole, moduleForPath, resolveAccess } from "@/lib/erp/access";
import { firstAllowedPage } from "@/lib/erp/permissions/page-catalog";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useMyAccessProfile } from "@/hooks/use-my-access-profile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthGate,
});

function AuthGate() {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useMyAccessProfile();
  if (access.isLoading) return <div className="min-h-screen bg-background" />;
  if (access.isError || !access.data?.userId) return <Navigate to="/auth" replace />;

  const { roles, allowedPages, pageMode } = access.data;
  const isAdmin = isSuperRole(roles);
  const path = location.pathname.length > 1 ? location.pathname.replace(/\/+$/, "") : location.pathname;
  const isErp = path === "/erp" || path.startsWith("/erp/");

  // 1. No role modules AND no custom page grants → nothing to show.
  if (isErp && !(isAdmin && pageMode !== "custom") && !hasBackofficeAccess(roles, allowedPages, pageMode)) {
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
  const allowed = resolveAccess(roles, allowedPages, path, pageMode);
  if (!allowed) {
    const mod = moduleForPath(path);
    const fallback =
      isAdmin && pageMode !== "custom"
        ? "/erp"
        : firstAllowedPage(pageMode === "custom" ? allowedPages : null);
    // Landing page itself blocked → send them to their first allowed page.
    if (path === "/erp" && fallback && fallback !== "/erp") {
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

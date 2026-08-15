import { Link } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Users & permissions moved into HRM (`/erp/hr/access`).
 * This section only points there so there is a single source of truth.
 */
export function UsersSection() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Users & Permissions এখন HRM-এ</h2>
          <p className="text-sm text-muted-foreground">
            Staff login, role, brand access, page-level permission আর HR employee linking — সব এখন
            HRM → Users &amp; Access পেজে।
          </p>
          <Button asChild size="sm">
            <Link to="/erp/hr/access">Open Users &amp; Access <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

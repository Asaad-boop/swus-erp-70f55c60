import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Menu as MenuIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandProvider } from "@/contexts/brand-context";
import { ErpSidebar } from "@/components/erp/erp-sidebar";
import { ErpQuickActionsProvider } from "@/contexts/erp-quick-actions";
import { GlobalSearchProvider } from "@/components/erp/global-search";
import { BrandSwitcher } from "@/components/erp/brand-switcher";
import { HeaderQuickActions } from "@/components/erp/header-quick-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { GlobalNewOrderNotifier } from "@/components/erp/global-new-order-notifier";
import { UpdateNotice } from "@/components/erp/update-notice";

export const Route = createFileRoute("/_authenticated/erp")({
  component: ErpLayout,
});

function ErpLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <BrandProvider>
      <ErpQuickActionsProvider>
      <GlobalSearchProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <ErpSidebar />
        <GlobalNewOrderNotifier />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <header className="h-14 shrink-0 border-b border-border/70 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon"><MenuIcon className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-60 overflow-y-auto"><ErpSidebar mobile /></SheetContent>
              </Sheet>
              <span className="font-display font-semibold tracking-tight">ERP</span>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <HeaderQuickActions />
              <UpdateNotice />
              <BrandSwitcher />
              <div className="mx-2 hidden sm:block h-5 w-px bg-border" />
              <div className="hidden sm:block text-xs text-muted-foreground truncate max-w-[180px]">{email}</div>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out" className="rounded-full">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <Outlet />
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </div>
      </GlobalSearchProvider>
      </ErpQuickActionsProvider>
    </BrandProvider>
  );
}
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRole } from "@/hooks/use-current-role";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function initials(text: string) {
  const base = text.split("@")[0] ?? "";
  const parts = base.split(/[.\-_\s]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

/** Bottom profile block. Reuses the existing supabase session — no new auth logic. */
export function SidebarUser({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const { roles } = useCurrentRole();

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const name = email?.split("@")[0] ?? "Account";
  const role = roles[0]?.replace(/_/g, " ") ?? "member";

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const trigger = (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2.5 rounded-md outline-none transition-colors duration-150",
        "hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "h-9 w-9 mx-auto justify-center" : "w-full px-2 py-2 text-left",
      )}
    >
      <span className="h-7 w-7 shrink-0 rounded-md bg-primary/10 text-primary text-[11px] font-semibold inline-flex items-center justify-center">
        {initials(email ?? "U")}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">{name}</span>
            <span className="block truncate text-[11px] capitalize text-muted-foreground">
              {role}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </>
      )}
    </button>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip delayDuration={60}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {name}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {email ?? "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/erp/settings" onClick={onNavigate}>
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

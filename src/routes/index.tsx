import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "SyncWithUs ERP — Workspace" },
    { name: "description", content: "Open your SyncWithUs ERP workspace for orders, inventory, procurement and finance." },
    { property: "og:title", content: "SyncWithUs ERP — Workspace" },
    { property: "og:description", content: "Open your workspace for orders, inventory, procurement and finance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/erp" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});

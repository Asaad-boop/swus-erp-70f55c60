import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Staff administration (list, create, password, disable, delete, save) lives
// in the `staff-admin` edge function — see src/lib/erp/access-admin.ts.

export const getMyAccessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readMyAccessProfile } = await import("@/lib/erp/access-profile.server");
    return readMyAccessProfile(context.supabase);
  });

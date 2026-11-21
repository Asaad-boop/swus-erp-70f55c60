/**
 * Staff access administration, via the `staff-admin` edge function (the only
 * place the service role exists). The browser sends its own session JWT; the
 * function checks that the caller is an admin.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  AccessWorkspaceUser,
  AppRole,
  BrandMode,
  PageMode,
} from "@/lib/erp/access-profile.model";

export type StaffUser = AccessWorkspaceUser & { hasEmployee?: boolean };

export type AccessPayload = {
  roles: AppRole[];
  brandMode: BrandMode;
  brandIds: string[];
  pageMode: PageMode;
  allowedPages: string[];
};

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("staff-admin", {
    body: { action, ...payload },
  });
  if (error) {
    let msg = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json?.();
      if (body?.error) msg = body.error;
    } catch {
      /* keep generic message */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const staffAdmin = {
  list: () => call<{ users: StaffUser[] }>("list"),
  save: (userId: string, access: AccessPayload, displayName?: string) =>
    call<{ ok: true }>("save", { userId, ...access, displayName }),
  create: (input: AccessPayload & { email: string; password: string; displayName: string }) =>
    call<{ id: string }>("create", input),
  setPassword: (userId: string, password: string) =>
    call<{ ok: true }>("set_password", { userId, password }),
  setBan: (userId: string, ban: boolean) => call<{ ok: true }>("set_ban", { userId, ban }),
  remove: (userId: string) => call<{ ok: true }>("delete", { userId }),
  loginLink: (email: string, type: "recovery" | "magiclink") =>
    call<{ url: string | null }>("login_link", { email, type }),
};

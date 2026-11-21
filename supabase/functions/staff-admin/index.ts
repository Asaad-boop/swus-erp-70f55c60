/**
 * Staff account administration — everything that needs the service role.
 *
 *   POST /functions/v1/staff-admin  { action, ...payload }  (caller's JWT required)
 *
 * Actions: list, save, create, set_password, set_ban, delete, login_link.
 * Every action requires the caller to hold the admin role. Saving roles,
 * brands and pages goes through the admin_replace_access_profile RPC (called
 * with the caller's own JWT so the audit log records who changed what).
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type AccessInput = {
  roles: string[];
  brandMode: "all" | "selected";
  brandIds: string[];
  pageMode: "role_default" | "custom";
  allowedPages: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(v: unknown, field = "userId"): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, `Invalid ${field}`);
  return v;
}

function password(v: unknown): string {
  if (typeof v !== "string" || v.length < 6 || v.length > 72)
    throw new HttpError(400, "Password কমপক্ষে ৬ অক্ষরের হতে হবে");
  return v;
}

function accessInput(p: Record<string, unknown>): AccessInput {
  const roles = Array.isArray(p.roles) ? p.roles.map(String).filter((r) => r !== "customer") : [];
  if (!roles.length) throw new HttpError(400, "অন্তত একটা সেক্টর বেছে নিন");
  const brandMode = p.brandMode === "selected" ? "selected" : "all";
  const brandIds = brandMode === "selected" && Array.isArray(p.brandIds) ? p.brandIds.map((b) => uuid(b, "brandId")) : [];
  const pageMode = p.pageMode === "custom" ? "custom" : "role_default";
  const allowedPages =
    pageMode === "custom" && Array.isArray(p.allowedPages) ? [...new Set(p.allowedPages.map(String))] : [];
  return { roles: [...new Set(roles)], brandMode, brandIds, pageMode, allowedPages };
}

async function callerFrom(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Login required");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Login required");
  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: data.user.id,
    _role: "admin",
  });
  if (roleErr) throw roleErr;
  if (!isAdmin) throw new HttpError(403, "শুধু admin এটা করতে পারবে");
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { id: data.user.id, asCaller };
}

async function saveProfile(
  asCaller: ReturnType<typeof createClient>,
  userId: string,
  input: AccessInput,
) {
  const { error } = await asCaller.rpc("admin_replace_access_profile", {
    _target_user_id: userId,
    _roles: input.roles,
    _brand_mode: input.brandMode,
    _brand_ids: input.brandIds,
    _page_mode: input.pageMode,
    _allowed_pages: input.allowedPages,
  });
  if (error) throw new HttpError(400, error.message);
}

async function listStaff() {
  const users: Array<Record<string, any>> = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const ids = users.map((u) => u.id as string);
  if (!ids.length) return { users: [] };

  const [rolesRes, profRes, permRes, brandRes, empRes] = await Promise.all([
    admin.from("user_roles").select("user_id,role").in("user_id", ids),
    admin.from("profiles").select("id,display_name").in("id", ids),
    admin.from("staff_permissions").select("user_id,permissions,updated_at").in("user_id", ids),
    admin.from("user_brand_access").select("user_id,brand_id").in("user_id", ids),
    admin.from("hr_employees").select("user_id,full_name,status").in("user_id", ids),
  ]);
  for (const r of [rolesRes, profRes, permRes, brandRes, empRes]) if (r.error) throw r.error;

  const roles = new Map<string, string[]>();
  for (const r of rolesRes.data ?? []) roles.set(r.user_id, [...(roles.get(r.user_id) ?? []), r.role]);
  const names = new Map((profRes.data ?? []).map((p) => [p.id, p.display_name]));
  const perms = new Map((permRes.data ?? []).map((p) => [p.user_id, p]));
  const brands = new Map<string, string[]>();
  for (const b of brandRes.data ?? []) brands.set(b.user_id, [...(brands.get(b.user_id) ?? []), b.brand_id]);
  const emps = new Map((empRes.data ?? []).map((e) => [e.user_id, e]));

  const out = users
    .map((u) => {
      const r = roles.get(u.id) ?? [];
      const perm = perms.get(u.id);
      const doc = (perm?.permissions ?? {}) as Record<string, unknown>;
      const emp = emps.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        displayName: emp?.full_name || names.get(u.id) || null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        bannedUntil: u.banned_until ?? null,
        roles: r,
        pageMode: doc.pageMode === "custom" ? "custom" : "role_default",
        allowedPages: Array.isArray(doc.allowedPages) ? doc.allowedPages.map(String) : [],
        brandMode: doc.brandMode === "selected" ? "selected" : "all",
        brandIds: brands.get(u.id) ?? [],
        updatedAt: perm?.updated_at ?? null,
        hasEmployee: !!emp,
      };
    })
    .filter((u) => perms.has(u.id) && u.roles.some((r: string) => r !== "customer"));
  return { users: out };
}

async function handle(req: Request) {
  const caller = await callerFrom(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  switch (action) {
    case "list":
      return listStaff();

    case "save": {
      const userId = uuid(body.userId);
      await saveProfile(caller.asCaller, userId, accessInput(body));
      if (typeof body.displayName === "string" && body.displayName.trim()) {
        await admin.from("profiles").upsert({ id: userId, display_name: body.displayName.trim() });
      }
      return { ok: true };
    }

    case "create": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Email ঠিক নেই");
      const displayName = String(body.displayName ?? "").trim();
      if (!displayName) throw new HttpError(400, "নাম দিন");
      const pw = password(body.password);
      const input = accessInput(body);
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: pw,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error || !created.user) {
        const msg = error?.message ?? "User তৈরি করা যায়নি";
        throw new HttpError(400, /already/i.test(msg) ? "এই email দিয়ে আগেই account আছে" : msg);
      }
      try {
        const { error: pErr } = await admin
          .from("profiles")
          .upsert({ id: created.user.id, display_name: displayName });
        if (pErr) throw pErr;
        await saveProfile(caller.asCaller, created.user.id, input);
      } catch (e) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw e;
      }
      return { id: created.user.id };
    }

    case "set_password": {
      const userId = uuid(body.userId);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: password(body.password) });
      if (error) throw new HttpError(400, error.message);
      return { ok: true };
    }

    case "set_ban": {
      const userId = uuid(body.userId);
      if (userId === caller.id) throw new HttpError(400, "নিজের account বন্ধ করা যাবে না");
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: body.ban ? "876000h" : "none",
      });
      if (error) throw new HttpError(400, error.message);
      return { ok: true };
    }

    case "delete": {
      const userId = uuid(body.userId);
      if (userId === caller.id) throw new HttpError(400, "নিজের account delete করা যাবে না");
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (isAdmin) {
        const { count } = await admin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "admin");
        if ((count ?? 0) <= 1) throw new HttpError(400, "শেষ admin-কে delete করা যাবে না");
      }
      await admin.from("staff_permissions").delete().eq("user_id", userId);
      await admin.from("user_brand_access").delete().eq("user_id", userId);
      await admin.from("user_roles").delete().eq("user_id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new HttpError(400, error.message);
      return { ok: true };
    }

    case "login_link": {
      const email = String(body.email ?? "");
      const type = body.type === "magiclink" ? "magiclink" : "recovery";
      const { data, error } = await admin.auth.admin.generateLink({ email, type });
      if (error) throw new HttpError(400, error.message);
      return { url: data.properties?.action_link ?? null };
    }

    default:
      throw new HttpError(400, `Unknown action: ${action}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return json(await handle(req));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    if (status >= 500) console.error("staff-admin", e);
    return json({ error: message }, status);
  }
});

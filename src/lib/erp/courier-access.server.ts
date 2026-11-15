// Shared courier permission check: role-based staff OR staff with explicit
// custom-page access to order pages (e.g. employee with /erp/orders/* grants).
const COURIER_ROLES = ["owner", "admin", "operations", "customer_service", "warehouse_staff", "packer"];
const ORDER_PAGES = ["/erp/orders", "/erp/orders/list", "/erp/orders/web", "/erp/orders/new", "/erp/orders/pre-orders", "/erp/orders/scan", "/erp/orders/incomplete"];

export async function assertCourierAccess(supabase: any): Promise<void> {
  const { data, error } = await supabase.rpc("get_my_access_profile");
  if (error || !data) throw new Error("Not authorized");
  const roles: string[] = Array.isArray(data.roles) ? data.roles : [];
  if (roles.some((r) => COURIER_ROLES.includes(r))) return;
  const pages: string[] = Array.isArray(data.allowedPages) ? data.allowedPages : [];
  if (pages.some((p) => ORDER_PAGES.includes(p) || p.startsWith("/erp/orders/"))) return;
  throw new Error("Not authorized");
}

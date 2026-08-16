import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck, UserPlus, Search, Loader2, Trash2, Power, KeyRound, Link2,
  Users as UsersIcon, LayoutGrid, Building2, Mail, Copy, ChevronDown, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { useCurrentRole } from "@/hooks/use-current-role";
import { HrPageHeader } from "@/components/erp/hr/hr-shell";
import {
  listAppUsers, createAppUser, updateUserRoles, deleteAppUser, toggleUserBan,
  setUserPassword, generateAuthLink, APP_ROLES,
} from "@/lib/erp/users.functions";
import { listUserBrandAccess, setUserBrandAccess } from "@/lib/erp/settings/user-brand-access.functions";
import { listAllowedPages, setUserAllowedPages } from "@/lib/erp/permissions/page-perms.functions";
import { PAGE_CATALOG, PAGE_GROUPS, ALL_PAGE_PATHS, type PageEntry } from "@/lib/erp/permissions/page-catalog";
import { pagesForRoles } from "@/lib/erp/access";

export const Route = createFileRoute("/_authenticated/erp/hr/access")({
  head: () => ({
    meta: [
      { title: "Users & Access — HRM" },
      { name: "description", content: "Staff logins, roles, brand access and page-level permissions inside HRM." },
      { property: "og:title", content: "Users & Access — HRM" },
      { property: "og:description", content: "Manage staff logins, roles and permissions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccessPage,
});

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access — all data, all settings, user management",
  operations: "Orders, inventory, courier — no finance secrets",
  accountant: "Finance, reports, reconciliation — read inventory",
  warehouse_staff: "Stock movements, picking, packing",
  packer: "Pack orders, print labels",
  customer_service: "Read orders & customers, add notes",
  marketing_manager: "Campaigns, ads, attribution — no finance",
  hr_admin: "Full HRM — employees, payroll, attendance",
  hr_manager: "HRM without payroll payouts",
  employee: "Self-service — own attendance & payslips",
  moderator: "Limited content moderation",
  customer: "Storefront only",
};

function AccessPage() {
  const { isAdmin, isLoading: roleLoading } = useCurrentRole();
  const { brands } = useBrand();
  const qc = useQueryClient();

  const listFn = useServerFn(listAppUsers);
  const createFn = useServerFn(createAppUser);
  const rolesFn = useServerFn(updateUserRoles);
  const deleteFn = useServerFn(deleteAppUser);
  const banFn = useServerFn(toggleUserBan);
  const pwFn = useServerFn(setUserPassword);
  const linkFn = useServerFn(generateAuthLink);
  const brandAccessFn = useServerFn(listUserBrandAccess);
  const setBrandAccessFn = useServerFn(setUserBrandAccess);
  const pagesFn = useServerFn(listAllowedPages);
  const setPagesFn = useServerFn(setUserAllowedPages);

  const usersQ = useQuery({ queryKey: ["admin-users"], enabled: isAdmin, queryFn: () => listFn() });
  const brandQ = useQuery({ queryKey: ["user-brand-access"], enabled: isAdmin, queryFn: () => brandAccessFn() });
  const pagesQ = useQuery({ queryKey: ["user-allowed-pages"], enabled: isAdmin, queryFn: () => pagesFn() });
  const empQ = useQuery({
    queryKey: ["hr-employees-link"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, full_name, employee_code, user_id, status")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["user-brand-access"] });
    qc.invalidateQueries({ queryKey: ["user-allowed-pages"] });
    qc.invalidateQueries({ queryKey: ["hr-employees-link"] });
    qc.invalidateQueries({ queryKey: ["my-allowed-pages"] });
  };

  const createMut = useMutation({
    mutationFn: (d: { email: string; password: string; displayName: string; role: string; brandIds: string[] }) =>
      createFn({ data: { email: d.email, password: d.password, displayName: d.displayName, roles: [d.role], brandIds: d.brandIds } }),
    onSuccess: () => { toast.success("User created"); setInviteOpen(false); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const roleMut = useMutation({
    mutationFn: (d: { userId: string; roles: string[] }) => rolesFn({ data: d }),
    onSuccess: () => { toast.success("Role updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const brandMut = useMutation({
    mutationFn: (d: { userId: string; brandIds: string[] }) => setBrandAccessFn({ data: d }),
    onSuccess: () => { toast.success("Brand access saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pageMut = useMutation({
    mutationFn: (d: { userId: string; allowedPages: string[] }) => setPagesFn({ data: d }),
    onSuccess: () => { toast.success("Page access saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const banMut = useMutation({
    mutationFn: (d: { userId: string; ban: boolean }) => banFn({ data: d }),
    onSuccess: () => { toast.success("Updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (userId: string) => deleteFn({ data: { userId } }),
    onSuccess: () => { toast.success("User deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const pwMut = useMutation({
    mutationFn: (d: { userId: string; password: string }) => pwFn({ data: d }),
    onSuccess: () => toast.success("Password updated"),
    onError: (e: Error) => toast.error(e.message),
  });
  const linkMut = useMutation({
    mutationFn: (email: string) => linkFn({ data: { email, type: "recovery" as const } }),
    onSuccess: (r: any) => {
      if (r?.url) { navigator.clipboard?.writeText(r.url); toast.success("Reset link copied"); }
      else toast.error("Link generate hoyni");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const empLinkMut = useMutation({
    mutationFn: async (d: { employeeId: string; userId: string | null }) => {
      const { error } = await supabase.from("hr_employees").update({ user_id: d.userId }).eq("id", d.employeeId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Employee link updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", password: "", displayName: "", role: "operations", brandIds: [] as string[] });

  const users = usersQ.data ?? [];
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return users.filter((u: any) => {
      if (roleFilter !== "all" && !u.roles.includes(roleFilter)) return false;
      if (!t) return true;
      return [u.email, u.display_name].some((v) => (v ?? "").toLowerCase().includes(t));
    });
  }, [users, q, roleFilter]);

  const empByUser = useMemo(() => {
    const m: Record<string, any> = {};
    (empQ.data ?? []).forEach((e: any) => { if (e.user_id) m[e.user_id] = e; });
    return m;
  }, [empQ.data]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u: any) => u.roles.includes("admin")).length,
    disabled: users.filter((u: any) => u.banned_until && u.banned_until !== "none").length,
    linked: users.filter((u: any) => empByUser[u.id]).length,
  }), [users, empByUser]);

  if (roleLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm text-muted-foreground">
          <Shield className="mb-2 h-5 w-5" />
          Admin only. Users & Access শুধু admin দেখতে পারে।
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
      <HrPageHeader
        icon={ShieldCheck}
        title="Users & Access"
        subtitle="ERP login, role, brand access, page permission আর employee linking — সবকিছু এক জায়গায়।"
        actions={<Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Invite user</Button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={UsersIcon} label="Staff logins" value={stats.total} tone="text-blue-600" />
        <Kpi icon={ShieldCheck} label="Admins" value={stats.admins} tone="text-violet-600" />
        <Kpi icon={Link2} label="Linked to employee" value={stats.linked} tone="text-emerald-600" />
        <Kpi icon={Power} label="Disabled" value={stats.disabled} tone="text-rose-600" />
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{rows.length} shown</Badge>
      </Card>

      <Card className="divide-y overflow-hidden">
        {usersQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading users…</div>}
        {!usersQ.isLoading && rows.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">কোনো user পাওয়া যায়নি।</div>
        )}
        {rows.map((u: any) => {
          const banned = !!u.banned_until && u.banned_until !== "none";
          const emp = empByUser[u.id];
          const userBrands: string[] = (brandQ.data as any)?.[u.id] ?? [];
          const allowedPages: string[] = (pagesQ.data as any)?.[u.id] ?? [];
          const open = openId === u.id;
          return (
            <div key={u.id}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button
                  onClick={() => setOpenId(open ? null : u.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(u.display_name || u.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {u.display_name || u.email}
                      {banned && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
                      {!u.email_confirmed_at && <Badge variant="outline" className="text-[10px]">Unverified</Badge>}
                      {emp && <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-700">{emp.full_name}</Badge>}
                      {allowedPages.length > 0 && <Badge variant="outline" className="text-[10px]">custom pages</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <ChevronDown className={`ml-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>

                <div className="flex max-w-[280px] flex-wrap justify-end gap-1">
                  {(u.roles.length ? u.roles : ["no role"]).map((r: string) => (
                    <Badge key={r} variant={r === "admin" ? "default" : "secondary"} className="font-mono text-[10px]">{r}</Badge>
                  ))}
                </div>
                <Button size="icon" variant="ghost" title={banned ? "Enable" : "Disable"} onClick={() => banMut.mutate({ userId: u.id, ban: !banned })}>
                  <Power className={`h-4 w-4 ${banned ? "text-destructive" : ""}`} />
                </Button>
                <Button size="icon" variant="ghost" title="Delete" onClick={() => { if (confirm(`Delete ${u.email}?`)) delMut.mutate(u.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {open && (
                <div className="border-t bg-muted/20 p-4">
                  <Tabs defaultValue="roles">
                    <TabsList>
                      <TabsTrigger value="roles"><Shield className="mr-1 h-3.5 w-3.5" />Roles</TabsTrigger>
                      <TabsTrigger value="brands"><Building2 className="mr-1 h-3.5 w-3.5" />Brands</TabsTrigger>
                      <TabsTrigger value="pages"><LayoutGrid className="mr-1 h-3.5 w-3.5" />Pages</TabsTrigger>
                      <TabsTrigger value="employee"><Link2 className="mr-1 h-3.5 w-3.5" />Employee</TabsTrigger>
                      <TabsTrigger value="security"><KeyRound className="mr-1 h-3.5 w-3.5" />Security</TabsTrigger>
                    </TabsList>

                    <TabsContent value="roles" className="pt-3">
                      <RolesEditor
                        current={u.roles}
                        saving={roleMut.isPending}
                        onSave={(rs) => roleMut.mutate({ userId: u.id, roles: rs })}
                      />
                    </TabsContent>

                    <TabsContent value="brands" className="pt-3">
                      <div className="flex flex-wrap gap-2">
                        {brands.map((b) => {
                          const on = userBrands.includes(b.id);
                          return (
                            <label key={b.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                              <Checkbox
                                checked={on}
                                onCheckedChange={(v) =>
                                  brandMut.mutate({
                                    userId: u.id,
                                    brandIds: v ? [...userBrands, b.id] : userBrands.filter((x) => x !== b.id),
                                  })
                                }
                              />
                              {b.name}
                            </label>
                          );
                        })}
                        {brands.length === 0 && <span className="text-xs italic text-muted-foreground">No brands</span>}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">কোনো brand সিলেক্ট না থাকলে user সব brand দেখবে (role অনুযায়ী)।</p>
                    </TabsContent>

                    <TabsContent value="pages" className="pt-3">
                      <PagesEditor
                        key={u.id + ":" + allowedPages.join(",")}
                        roles={u.roles}
                        current={allowedPages}
                        saving={pageMut.isPending}
                        onSave={(pages) => pageMut.mutate({ userId: u.id, allowedPages: pages })}
                      />
                    </TabsContent>

                    <TabsContent value="employee" className="pt-3">
                      <EmployeeLinker
                        employees={empQ.data ?? []}
                        linked={emp ?? null}
                        onLink={(employeeId) => {
                          if (emp && emp.id !== employeeId) empLinkMut.mutate({ employeeId: emp.id, userId: null });
                          if (employeeId) empLinkMut.mutate({ employeeId, userId: u.id });
                        }}
                        onUnlink={() => emp && empLinkMut.mutate({ employeeId: emp.id, userId: null })}
                      />
                    </TabsContent>

                    <TabsContent value="security" className="space-y-3 pt-3">
                      <PasswordSetter saving={pwMut.isPending} onSave={(pw) => pwMut.mutate({ userId: u.id, password: pw })} />
                      <Button size="sm" variant="outline" onClick={() => linkMut.mutate(u.email)} disabled={linkMut.isPending}>
                        {linkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        Copy password-reset link
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Role: <span className="font-mono">{u.roles.join(", ") || "—"}</span> — {ROLE_DESCRIPTIONS[u.roles[0]] ?? "—"}
                      </p>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Role descriptions</h3>
        <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
          {APP_ROLES.map((r) => (
            <div key={r} className="flex items-start gap-2">
              <Badge variant="outline" className="shrink-0 font-mono">{r}</Badge>
              <span className="text-muted-foreground">{ROLE_DESCRIPTIONS[r] ?? "—"}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* INVITE */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></div>
            <div><Label>Display name</Label><Input value={invite.displayName} onChange={(e) => setInvite({ ...invite, displayName: e.target.value })} /></div>
            <div><Label>Temporary password</Label><Input type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APP_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Brand access</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {brands.map((b) => {
                  const on = invite.brandIds.includes(b.id);
                  return (
                    <label key={b.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => setInvite({
                          ...invite,
                          brandIds: v ? [...invite.brandIds, b.id] : invite.brandIds.filter((x) => x !== b.id),
                        })}
                      />
                      {b.name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMut.mutate(invite)}
              disabled={createMut.isPending || !invite.email || invite.password.length < 6}
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <Icon className={`h-7 w-7 opacity-70 ${tone}`} />
      </div>
    </Card>
  );
}

function RolesEditor({ current, saving, onSave }: { current: string[]; saving: boolean; onSave: (roles: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(current);
  const dirty = sel.slice().sort().join(",") !== current.slice().sort().join(",");
  const toggle = (r: string) => setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        একজন user-কে একাধিক role দেওয়া যাবে — access গুলো merge হবে। Role না দিলে user কিছুই দেখবে না
        (যদি না নিচে custom page দেওয়া থাকে)।
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {APP_ROLES.map((r) => {
          const on = sel.includes(r);
          return (
            <label
              key={r}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition ${on ? "border-primary/50 bg-primary/5" : "hover:bg-accent"}`}
            >
              <Checkbox checked={on} onCheckedChange={() => toggle(r)} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block font-mono font-medium">{r}</span>
                <span className="block text-muted-foreground">{ROLE_DESCRIPTIONS[r] ?? "—"}</span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onSave(sel)} disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save roles
        </Button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>
    </div>
  );
}

function PagesEditor({
  roles, current, saving, onSave,
}: { roles: string[]; current: string[]; saving: boolean; onSave: (pages: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(current);
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const toggle = (p: string) =>
    setSel((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  const dirty = sel.slice().sort().join("|") !== current.slice().sort().join("|");
  const term = q.trim().toLowerCase();

  const visible = useMemo(
    () =>
      PAGE_CATALOG.filter((p) => {
        if (p.hidden && !showHidden && !sel.includes(p.path)) return false;
        if (!term) return true;
        return (p.label + " " + p.path + " " + p.section).toLowerCase().includes(term);
      }),
    [term, showHidden, sel],
  );

  const byGroup = useMemo(() => {
    const m = new Map<string, Map<string, PageEntry[]>>();
    for (const p of visible) {
      if (!m.has(p.group)) m.set(p.group, new Map());
      const sec = m.get(p.group)!;
      if (!sec.has(p.section)) sec.set(p.section, []);
      sec.get(p.section)!.push(p);
    }
    return m;
  }, [visible]);

  const setMany = (paths: string[], on: boolean) =>
    setSel((s) => (on ? Array.from(new Set([...s, ...paths])) : s.filter((x) => !paths.includes(x))));

  const roleDefault = () => setSel(pagesForRoles(roles, ALL_PAGE_PATHS));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
        কিছুই সিলেক্ট না থাকলে <b>role-এর default access</b> কাজ করবে। এক বা একাধিক page সিলেক্ট করলে
        সেই লিস্টই চূড়ান্ত — role matrix আর প্রযোজ্য হবে না। Dashboard দিতে চাইলে <b>Overview → Dashboard</b>{" "}
        অবশ্যই টিক দাও।
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search page…" className="h-8 pl-8 text-xs" />
        </div>
        <Badge variant="secondary" className="text-[11px]">{sel.length} selected</Badge>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={roleDefault}>
          Load role default
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSel(ALL_PAGE_PATHS.filter((p) => !PAGE_CATALOG.find((x) => x.path === p)?.hidden))}>
          Select all
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSel([])}>
          Clear
        </Button>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox checked={showHidden} onCheckedChange={(v) => setShowHidden(!!v)} />
          Show hidden routes
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...byGroup.entries()].map(([group, sections]) => {
          const groupPaths = [...sections.values()].flat().map((p) => p.path);
          const allOn = groupPaths.every((p) => sel.includes(p));
          return (
            <div key={group} className="rounded-xl border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{group}</span>
                <button
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setMany(groupPaths, !allOn)}
                >
                  {allOn ? "None" : "All"}
                </button>
              </div>
              <div className="space-y-2.5">
                {[...sections.entries()].map(([section, pages]) => {
                  const secPaths = pages.map((p) => p.path);
                  const secOn = secPaths.every((p) => sel.includes(p));
                  return (
                    <div key={section}>
                      {section !== group && (
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{section}</span>
                          <button
                            className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                            onClick={() => setMany(secPaths, !secOn)}
                          >
                            {secOn ? "clear" : "all"}
                          </button>
                        </div>
                      )}
                      <div className="space-y-1">
                        {pages.map((p) => (
                          <label
                            key={p.path}
                            title={p.path}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent"
                          >
                            <Checkbox checked={sel.includes(p.path)} onCheckedChange={() => toggle(p.path)} />
                            <span className="truncate">{p.label}</span>
                            {p.hidden && <Badge variant="outline" className="ml-auto text-[9px]">hidden</Badge>}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background/95 py-2 backdrop-blur">
        <Button size="sm" onClick={() => onSave(sel)} disabled={saving || !dirty}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save page access
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSel(current)} disabled={saving || !dirty}>
          Cancel
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onSave([])} disabled={saving || current.length === 0}>
          Reset to role default
        </Button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>
    </div>
  );
}

function EmployeeLinker({
  employees, linked, onLink, onUnlink,
}: { employees: any[]; linked: any | null; onLink: (employeeId: string) => void; onUnlink: () => void }) {
  const [value, setValue] = useState(linked?.id ?? "");
  const free = employees.filter((e) => !e.user_id || e.id === linked?.id);
  return (
    <div className="space-y-3">
      {linked ? (
        <p className="text-xs text-muted-foreground">
          Linked employee: <span className="font-medium text-foreground">{linked.full_name}</span>
          {linked.employee_code ? ` (${linked.employee_code})` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">এই login কোনো HR employee-র সাথে link করা নেই।</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select employee…" /></SelectTrigger>
          <SelectContent>
            {free.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.full_name}{e.employee_code ? ` · ${e.employee_code}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => value && onLink(value)} disabled={!value}>
          <Link2 className="h-4 w-4" /> Link
        </Button>
        {linked && <Button size="sm" variant="outline" onClick={onUnlink}>Unlink</Button>}
      </div>
    </div>
  );
}

function PasswordSetter({ saving, onSave }: { saving: boolean; onSave: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label className="text-xs">Set new password</Label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-56" placeholder="min 6 chars" />
      </div>
      <Button size="sm" onClick={() => { onSave(pw); setPw(""); }} disabled={saving || pw.length < 6}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update
      </Button>
    </div>
  );
}
